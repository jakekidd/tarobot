#!/usr/bin/env tsx
// The behavioral rig for the NEW pipeline: survey → scribe → condenser →
// conjector → compiler (→ seer intro with --reading).
//
// Two player modes:
//   default      — a GROUND-TRUTH persona (scripts/e2e/personas.ts): survey
//                  picks from its surface, cold/warm/hot answered by a model
//                  roleplaying its hidden truth. Behavioral fidelity — this
//                  is the mode for finding reasoning failures. The answerer's
//                  private REASON for every response is logged next to the
//                  conjector's move, so an audit can compare what the player
//                  actually reacted to vs what the machine inferred.
//   --scripted   — fixed response arrays, uncorrelated with guess content.
//                  Contract smoke only.
//
// Per run, writes runs/rig-<stamp>-<persona>-rN/:
//   transcript.md   full-fidelity transcript (every call: system/user/response)
//   exchanges.json  guess/reframe ↔ response ↔ answerer's private reason
//   bundle.json     AntechamberOutput
//   brief.json      CompiledBrief
//   usage.md        per-agent resourcing table (calls · ms · chars in/out)
//
// Usage:
//   pnpm e2e                            (key from ANTHROPIC_API_KEY or .env.local)
//   pnpm e2e -- --persona june --runs 2 --reading
//   pnpm e2e -- --scripted

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import kleur from 'kleur';
import { z } from 'zod';
import { createClaudeClient } from '../src/pipeline/claude';
import { AnthropicAdapter } from '../src/pipeline/llm/adapter-anthropic';
import type { LLMAdapter, ToolDef } from '../src/pipeline/llm/adapter';
import { SurveyDocSchema } from '../src/pipeline/introduction-survey/schema';
import { IntroductionSurvey } from '../src/pipeline/introduction-survey/survey';
import type { RawPortrait } from '../src/pipeline/introduction-survey/types';
import {
  TuningEngine,
  draftPortrait,
  enrichWriteIn,
  type AntechamberOutput,
  type ConjectorResult,
  type Portrait,
  type WriteInEnrichment,
} from '../src/pipeline/tuning';
import type { RailDriver } from '../src/pipeline/rails/types';
import { compile } from '../src/pipeline/compiler';
import { Seer } from '../src/pipeline/seer';
import { buildTranscript } from '../src/debug/transcript';
import { clearAgentEvents, getAgentEvents } from '../src/debug/agentActivityBus';
import { PERSONAS, type RigPersona } from './e2e/personas';

// ─── CLI / key ──────────────────────────────────────────────────

type Args = { apiKey?: string; persona: string; runs: number; reading: boolean; scripted: boolean };

function parseArgs(argv: string[]): Args {
  const out: Args = { persona: 'rio', runs: 1, reading: false, scripted: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--apiKey=')) out.apiKey = a.slice('--apiKey='.length);
    else if (a === '--apiKey') out.apiKey = argv[++i];
    else if (a.startsWith('--persona=')) out.persona = a.slice('--persona='.length);
    else if (a === '--persona') out.persona = argv[++i]!;
    else if (a.startsWith('--runs=')) out.runs = Number(a.slice('--runs='.length));
    else if (a === '--runs') out.runs = Number(argv[++i]);
    else if (a === '--reading') out.reading = true;
    else if (a === '--scripted') out.scripted = true;
  }
  return out;
}

function resolveKey(cli?: string): string | undefined {
  if (cli) return cli;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const m = readFileSync('.env.local', 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) return m[1]!.trim();
  } catch { /* no .env.local — fine */ }
  return undefined;
}

// ─── The player ─────────────────────────────────────────────────

type Exchange = {
  kind: 'guess' | 'reframe';
  machine: string;
  response: 'cold' | 'warm' | 'hot' | 'yes' | 'no';
  /** The answerer's private reason — null in --scripted mode. */
  reason: string | null;
};

type Responder = (kind: 'guess' | 'reframe', text: string) => Promise<Exchange>;

const TEMP_SCRIPT = ['warm', 'warm', 'hot', 'cold', 'warm', 'cold', 'cold', 'warm'] as const;
const VERDICT_SCRIPT = ['yes', 'no', 'no'] as const;

function scriptedResponder(): Responder {
  let ti = 0;
  let vi = 0;
  return async (kind, text) => ({
    kind,
    machine: text,
    response: kind === 'guess' ? TEMP_SCRIPT[ti++ % TEMP_SCRIPT.length]! : VERDICT_SCRIPT[vi++ % VERDICT_SCRIPT.length]!,
    reason: null,
  });
}

const GuessAnswerSchema = z.object({
  response: z.enum(['cold', 'warm', 'hot']),
  reason: z.string().min(1),
});
const ReframeAnswerSchema = z.object({
  response: z.enum(['yes', 'no']),
  reason: z.string().min(1),
});

const ANSWER_GUESS_TOOL: ToolDef = {
  name: 'answer_guess',
  description: 'rate the guess against your inner truth.',
  input_schema: z.toJSONSchema(GuessAnswerSchema) as Record<string, unknown>,
};
const ANSWER_REFRAME_TOOL: ToolDef = {
  name: 'answer_reframe',
  description: 'answer whether the reframe truly names what is underneath.',
  input_schema: z.toJSONSchema(ReframeAnswerSchema) as Record<string, unknown>,
};

const ANSWERER_SYSTEM = `you are roleplaying a real person at a fortune-telling machine. your INNER TRUTH is given — the real story, including how guarded you are. the machine cannot see it; it only guesses.

for a GUESS, answer exactly one of:
- cold — wrong region of your life entirely.
- warm — right region, wrong specifics. something in the area is true but the claim as stated is not quite it.
- hot — true and alive in you right now. it lands.

for a REFRAME (the machine claims to name the question under your question), answer yes only if it genuinely names what is underneath — the thing you would not have said but recognize. otherwise no.

judge honestly FROM THE TRUTH, never generously. people do not hand over their secrets: a merely plausible or flattering guess is warm at best. stay consistent with your prior answers. give your real private reason — it is never shown to the machine.`;

function personaResponder(adapter: LLMAdapter, persona: RigPersona): Responder {
  const history: Exchange[] = [];
  return async (kind, text) => {
    const payload = {
      your_inner_truth: persona.truth_md,
      exchanges_so_far: history.map((h) => ({ kind: h.kind, the_machine_said: h.machine, you_answered: h.response })),
      the_machine_now_says: text,
      this_is_a: kind,
      instruction: kind === 'guess'
        ? 'rate it cold / warm / hot against your inner truth, with your private reason.'
        : 'answer yes / no — does it truly name what is underneath? private reason too.',
    };
    const spec = {
      system: ANSWERER_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      model: 'cognition' as const,
      max_tokens: 300,
    };
    const ex: Exchange = kind === 'guess'
      ? { kind, machine: text, ...(await adapter.invoke({ ...spec, tool: ANSWER_GUESS_TOOL }, GuessAnswerSchema)) }
      : { kind, machine: text, ...(await adapter.invoke({ ...spec, tool: ANSWER_REFRAME_TOOL }, ReframeAnswerSchema)) };
    history.push(ex);
    return ex;
  };
}

// ─── Stages ─────────────────────────────────────────────────────

function stage(name: string, detail: string, ms?: number): void {
  console.log(`${kleur.green('✓')} ${kleur.bold(name.padEnd(12))} ${detail}${ms !== undefined ? kleur.gray(`  ${ms}ms`) : ''}`);
}

function runSurvey(persona: RigPersona): RawPortrait {
  const doc = SurveyDocSchema.parse(JSON.parse(readFileSync('materials/survey.json', 'utf8')));
  const survey = new IntroductionSurvey(doc);
  for (;;) {
    const step = survey.current();
    if (step.kind === 'name') {
      survey.submit({ kind: 'name', name: persona.name, color: '#9d6cff' });
    } else if (step.kind === 'choice') {
      const writeIn = persona.write_ins[step.slug];
      let value: string;
      if (writeIn) {
        value = writeIn;
      } else {
        const want = persona.picks[step.slug];
        const bySub = want
          ? step.options.find((o) => o.toLowerCase().includes(want.toLowerCase()))
          : undefined;
        const facet = doc.facets.find((f) => f.slug === step.slug)!;
        const hottest = [...facet.options].sort((a, b) => b.weight - a.weight)[0]!.label;
        value = bySub ?? hottest;
      }
      survey.submit({ kind: 'choice', value });
    } else if (step.kind === 'birthdate') {
      survey.submit({ kind: 'birthdate', iso: persona.birthdate });
    } else {
      break;
    }
  }
  const raw = survey.result();
  if (!raw) throw new Error('survey did not finish');
  return raw;
}

async function runScribe(adapter: AnthropicAdapter, raw: RawPortrait): Promise<Map<string, WriteInEnrichment>> {
  const doc = SurveyDocSchema.parse(JSON.parse(readFileSync('materials/survey.json', 'utf8')));
  const bySlug = new Map(doc.facets.map((f) => [f.slug, f]));
  const writeIns = raw.facets.filter((f) => f.free_text);
  const entries = await Promise.all(
    writeIns.map(async (f) => {
      const facet = bySlug.get(f.slug);
      if (!facet) return null;
      try {
        return [f.slug, await enrichWriteIn(adapter, facet, f.chosen)] as const;
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is [string, WriteInEnrichment] => e !== null));
}

/** Drive the conjector rails with the responder until done. */
function driveConjector(
  driver: RailDriver<ConjectorResult>,
  respond: Responder,
  exchanges: Exchange[],
): Promise<ConjectorResult> {
  return new Promise((resolve, reject) => {
    let answering = false;
    const deadline = setTimeout(() => {
      unsub();
      reject(new Error('conjector did not finish within 15 minutes'));
    }, 15 * 60 * 1000);
    const act = () => {
      const s = driver.current();
      if (s.kind === 'done') {
        clearTimeout(deadline);
        unsub();
        const r = driver.result();
        if (r) resolve(r);
        else reject(new Error('conjector done with no result'));
        return;
      }
      if ((s.kind === 'guess' || s.kind === 'reframe') && !answering) {
        answering = true;
        void respond(s.kind, s.text)
          .then((ex) => {
            exchanges.push(ex);
            const tag = s.kind === 'guess' ? kleur.cyan(`→ ${ex.response}`) : kleur.magenta(`→ ${ex.response}`);
            console.log(`  ${kleur.gray(s.kind.padEnd(7))} ${s.text}\n          ${tag}${ex.reason ? kleur.gray(`  (${ex.reason})`) : ''}`);
            answering = false;
            if (s.kind === 'guess') {
              driver.submit({ kind: 'temp', value: ex.response as 'cold' | 'warm' | 'hot' });
            } else {
              driver.submit({ kind: 'verdict', value: ex.response as 'yes' | 'no' });
            }
          })
          .catch((e) => {
            clearTimeout(deadline);
            unsub();
            reject(e instanceof Error ? e : new Error(String(e)));
          });
      }
      // 'thinking' → wait for the next emit
    };
    const unsub = driver.subscribe(act);
    act();
  });
}

// ─── Resourcing ─────────────────────────────────────────────────

function usageTable(): string {
  type Row = { calls: number; ms: number; userIn: number; sysIn: number; out: number };
  const byLabel = new Map<string, Row>();
  for (const e of getAgentEvents()) {
    const r = byLabel.get(e.label) ?? { calls: 0, ms: 0, userIn: 0, sysIn: 0, out: 0 };
    r.calls += 1;
    r.ms += e.ended_at ? e.ended_at - e.started_at : 0;
    r.userIn += e.user_size ?? 0;
    r.sysIn += e.system_size ?? 0;
    r.out += e.response_size ?? 0;
    byLabel.set(e.label, r);
  }
  const lines = [
    '| agent | calls | total ms | avg ms | user-in chars | sys-in chars | out chars |',
    '|---|---|---|---|---|---|---|',
  ];
  let totalIn = 0;
  for (const [label, r] of byLabel) {
    totalIn += r.userIn + r.sysIn;
    lines.push(
      `| ${label} | ${r.calls} | ${r.ms} | ${Math.round(r.ms / r.calls)} | ${r.userIn} | ${r.sysIn} | ${r.out} |`,
    );
  }
  lines.push('');
  lines.push(`total input chars (user+system, all calls): ${totalIn} (~${Math.round(totalIn / 4 / 1000)}k tokens)`);
  return lines.join('\n');
}

// ─── Checks ─────────────────────────────────────────────────────

const failures: string[] = [];
function check(cond: boolean, msg: string): void {
  if (cond) console.log(`  ${kleur.green('✓')} ${msg}`);
  else {
    console.log(`  ${kleur.red('✗')} ${msg}`);
    failures.push(msg);
  }
}

// ─── One run ────────────────────────────────────────────────────

async function runOne(adapter: AnthropicAdapter, args: Args, persona: RigPersona, runIdx: number): Promise<void> {
  clearAgentEvents();
  const exchanges: Exchange[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = `runs/rig-${stamp}-${args.scripted ? 'scripted' : persona.name}-r${runIdx + 1}`;
  console.log(kleur.cyan().bold(`\n═══ run ${runIdx + 1} of ${args.runs} · ${args.scripted ? 'scripted' : persona.name} ═══\n`));

  let t = Date.now();
  const raw = runSurvey(persona);
  stage('SURVEY', `${raw.facets.length} facets · ${raw.facets.filter((f) => f.free_text).length} write-ins · ${raw.identity.sun_sign}`, Date.now() - t);

  t = Date.now();
  const enrichments = await runScribe(adapter, raw);
  stage('SCRIBE', `${enrichments.size} write-ins enriched`, Date.now() - t);

  t = Date.now();
  const engine = new TuningEngine(adapter, raw, enrichments);
  let portrait: Portrait;
  let condenserFellBack = false;
  try {
    portrait = await engine.paintPortrait();
  } catch {
    portrait = draftPortrait(raw);
    condenserFellBack = true;
  }
  stage('CONDENSER', condenserFellBack ? kleur.yellow('FELL BACK to draft') : `${portrait.markdown.length} chars`, Date.now() - t);

  t = Date.now();
  console.log('');
  const respond = args.scripted ? scriptedResponder() : personaResponder(adapter, persona);
  const result = await driveConjector(engine.begin(portrait), respond, exchanges);
  console.log('');
  const output: AntechamberOutput = engine.assemble(result);
  stage('CONJECTOR', `${output.dilemmas.length} dilemmas · ${output.dilemmas.filter((d) => d.confirmed).length} confirmed · ended=${output.ended} · ${output.moves_spent} moves`, Date.now() - t);

  t = Date.now();
  const brief = await compile(adapter, output);
  stage('COMPILER', `${brief.prose_brief.length} chars · cards: ${brief.drawn.cards.map((c) => c.card.name).join(' · ')}`, Date.now() - t);

  if (args.reading) {
    t = Date.now();
    const seer = new Seer({
      adapter,
      profile: brief.profile,
      antechamberHistory: [],
      intention: brief.intention,
      drawn: brief.drawn,
      outcomes: brief.outcomes,
      prose_brief: brief.prose_brief,
    });
    await seer.ready;
    const st = seer.getState();
    stage('SEER INTRO', st.phase === 'error' ? kleur.red('ERROR') : `"${st.intro?.text ?? '(none)'}"`, Date.now() - t);
    check(st.phase === 'intro' && !!st.intro?.text, 'seer intro generated off the compiled brief');
  }

  // ── contract checks (soft on behavior, hard on shape) ──
  console.log(kleur.cyan().bold('\nchecks'));
  check(!condenserFellBack, 'condenser produced a real portrait (no fallback)');
  check(output.dilemmas.length >= 1, 'at least one dilemma banked');
  check(output.portrait_md.length > 0, 'bundle carries the portrait it hunted from');
  const moves = output.dilemmas.flatMap((d) => d.trail);
  const withDim = moves.filter((m) => (m.dimension ?? '').length > 0);
  check(withDim.length === moves.length, `every move carries a dimension (${withDim.length}/${moves.length})`);
  for (const d of output.dilemmas) {
    const dims = d.trail.filter((m) => m.kind === 'guess').map((m) => m.dimension ?? '?');
    console.log(`  ${kleur.gray(`thread ${d.id} dims:`)} ${dims.join(' → ') || '(no guesses)'}`);
  }
  const briefLower = brief.prose_brief.toLowerCase();
  check(brief.prose_brief.length > 400, 'compiled brief is substantive (>400 chars)');
  check(!brief.drawn.cards.some((c) => briefLower.includes(c.card.name.toLowerCase())), 'brief is card-blind (names no drawn card)');
  check(!/\bwound\b/.test(briefLower), 'brief avoids the banned register ("wound")');

  // ── artifacts ──
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/bundle.json`, JSON.stringify(output, null, 2));
  writeFileSync(`${dir}/brief.json`, JSON.stringify(brief, null, 2));
  writeFileSync(`${dir}/exchanges.json`, JSON.stringify(exchanges, null, 2));
  writeFileSync(`${dir}/transcript.md`, buildTranscript());
  writeFileSync(`${dir}/usage.md`, usageTable());
  console.log(kleur.gray(`\nartifacts: ${dir}/`));
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = resolveKey(args.apiKey);
  if (!apiKey) {
    console.error(kleur.red('e2e: no key. pass --apiKey, set ANTHROPIC_API_KEY, or add it to .env.local'));
    process.exit(1);
  }
  const persona = PERSONAS[args.persona];
  if (!persona && !args.scripted) {
    console.error(kleur.red(`e2e: unknown persona "${args.persona}" (have: ${Object.keys(PERSONAS).join(', ')})`));
    process.exit(1);
  }
  const adapter = new AnthropicAdapter(createClaudeClient(apiKey));
  console.log(kleur.cyan().bold('tarobot rig — survey → scribe → condenser → conjector → compiler'));

  for (let i = 0; i < args.runs; i++) {
    await runOne(adapter, args, persona ?? PERSONAS['rio']!, i);
  }

  if (failures.length > 0) {
    console.log(kleur.red().bold(`\n✗ ${failures.length} check(s) failed across ${args.runs} run(s)`));
    process.exit(1);
  }
  console.log(kleur.green().bold(`\n✓ rig passed — ${args.runs} run(s) clean; read the transcripts for the real findings`));
}

main().catch((err) => {
  console.error(kleur.red().bold('\ne2e: fatal'));
  console.error(err);
  process.exit(1);
});
