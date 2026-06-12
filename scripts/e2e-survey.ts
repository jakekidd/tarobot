#!/usr/bin/env tsx
// E2E smoke for the NEW pipeline: survey → scribe → condenser → conjector →
// compiler (→ optionally the seer's intro, with --reading). A scripted
// player walks the real materials/survey.json (two write-ins to exercise
// the Scribe) and answers the conjector from a fixed cold/warm/hot script —
// deterministic responses, so this verifies the CONTRACT end to end, not
// reading quality (responses aren't correlated with what the guesses say).
//
// Writes the full-fidelity transcript + the AntechamberOutput bundle + the
// CompiledBrief to runs/.
//
// Usage:
//   pnpm e2e -- --apiKey=sk-ant-...          (or ANTHROPIC_API_KEY in env
//   pnpm e2e -- --reading                     or .env.local)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import kleur from 'kleur';
import { createClaudeClient } from '../src/pipeline/claude';
import { AnthropicAdapter } from '../src/pipeline/llm/adapter-anthropic';
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

// ─── The scripted player ────────────────────────────────────────
// Picks resolve by substring against the live survey.json labels (so label
// edits don't break the script); a miss falls back to the highest-weight
// option. `write_in` submits free text (the Scribe path).

const PERSONA: Record<string, { pick?: string; write_in?: string }> = {
  'basics': { pick: 'mostly' },
  'relationship-status': { pick: 'complicated' },
  'work': { write_in: "i teach piano to kids but the students are drying up and i can't tell if i mind" },
  'social': { pick: 'one person' },
  'joys': { pick: 'used to' },
  'rest': { pick: 'half-on' },
  'body': { pick: 'tool' },
  'change': { pick: 'wait' },
  'conflict': { pick: 'cold' },
  'attachment': { pick: 'assume the worst' },
  'ego': { pick: 'dismissed' },
  'family': { pick: 'brace' },
  'yearning': { pick: "can't name" },
  'agency': { write_in: 'honestly it feels like it happened to someone else' },
};
const PLAYER_NAME = 'rio';
const PLAYER_BIRTHDATE = '1991-03-22';

// Conjector response scripts (cycled when exhausted). Thread 1 should
// confirm; later threads exercise NO + soft closes + the reroot.
const TEMP_SCRIPT = ['warm', 'warm', 'hot', 'cold', 'warm', 'cold', 'cold', 'warm'] as const;
const VERDICT_SCRIPT = ['yes', 'no', 'no'] as const;

// ─── CLI / key ──────────────────────────────────────────────────

function parseArgs(argv: string[]): { apiKey?: string; reading: boolean } {
  const out: { apiKey?: string; reading: boolean } = { reading: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--apiKey=')) out.apiKey = a.slice('--apiKey='.length);
    else if (a === '--apiKey') out.apiKey = argv[++i];
    else if (a === '--reading') out.reading = true;
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

// ─── Stages ─────────────────────────────────────────────────────

function stage(name: string, detail: string, ms?: number): void {
  console.log(
    `${kleur.green('✓')} ${kleur.bold(name.padEnd(12))} ${detail}${ms !== undefined ? kleur.gray(`  ${ms}ms`) : ''}`,
  );
}

function runSurvey(): RawPortrait {
  const doc = SurveyDocSchema.parse(JSON.parse(readFileSync('materials/survey.json', 'utf8')));
  const survey = new IntroductionSurvey(doc);
  for (;;) {
    const step = survey.current();
    if (step.kind === 'name') {
      survey.submit({ kind: 'name', name: PLAYER_NAME, color: '#9d6cff' });
    } else if (step.kind === 'choice') {
      const want = PERSONA[step.slug];
      let value: string;
      if (want?.write_in) {
        value = want.write_in;
      } else {
        const bySub = want?.pick
          ? step.options.find((o) => o.toLowerCase().includes(want.pick!.toLowerCase()))
          : undefined;
        const facet = doc.facets.find((f) => f.slug === step.slug)!;
        const hottest = [...facet.options].sort((a, b) => b.weight - a.weight)[0]!.label;
        value = bySub ?? hottest;
      }
      survey.submit({ kind: 'choice', value });
    } else if (step.kind === 'birthdate') {
      survey.submit({ kind: 'birthdate', iso: PLAYER_BIRTHDATE });
    } else {
      break;
    }
  }
  const raw = survey.result();
  if (!raw) throw new Error('survey did not finish');
  return raw;
}

async function runScribe(
  adapter: AnthropicAdapter,
  raw: RawPortrait,
): Promise<Map<string, WriteInEnrichment>> {
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

/** Drive the conjector rails with the scripted responses until done. */
function driveConjector(driver: RailDriver<ConjectorResult>): Promise<ConjectorResult> {
  return new Promise((resolve, reject) => {
    let ti = 0;
    let vi = 0;
    const deadline = setTimeout(() => {
      unsub();
      reject(new Error('conjector did not finish within 10 minutes'));
    }, 10 * 60 * 1000);
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
      if (s.kind === 'guess') {
        const v = TEMP_SCRIPT[ti++ % TEMP_SCRIPT.length]!;
        console.log(`  ${kleur.gray('guess')}   ${s.text}\n  ${kleur.cyan(`→ ${v}`)}`);
        setTimeout(() => driver.submit({ kind: 'temp', value: v }), 0);
      } else if (s.kind === 'reframe') {
        const v = VERDICT_SCRIPT[vi++ % VERDICT_SCRIPT.length]!;
        console.log(`  ${kleur.gray('reframe')} ${s.text}\n  ${kleur.magenta(`→ ${v}`)}`);
        setTimeout(() => driver.submit({ kind: 'verdict', value: v }), 0);
      }
      // 'thinking' → wait for the next emit
    };
    const unsub = driver.subscribe(act);
    act();
  });
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

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = resolveKey(args.apiKey);
  if (!apiKey) {
    console.error(kleur.red('e2e: no key. pass --apiKey, set ANTHROPIC_API_KEY, or add it to .env.local'));
    process.exit(1);
  }
  const adapter = new AnthropicAdapter(createClaudeClient(apiKey));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  mkdirSync('runs', { recursive: true });

  console.log(kleur.cyan().bold('tarobot e2e — survey → scribe → condenser → conjector → compiler\n'));

  // SURVEY (no AI)
  let t = Date.now();
  const raw = runSurvey();
  stage('SURVEY', `${raw.facets.length} facets · ${raw.facets.filter((f) => f.free_text).length} write-ins · ${raw.identity.sun_sign}`, Date.now() - t);

  // SCRIBE
  t = Date.now();
  const enrichments = await runScribe(adapter, raw);
  stage('SCRIBE', `${enrichments.size} write-ins enriched`, Date.now() - t);

  // CONDENSER
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

  // CONJECTOR
  t = Date.now();
  console.log('');
  const result = await driveConjector(engine.begin(portrait));
  console.log('');
  const output: AntechamberOutput = engine.assemble(result);
  stage('CONJECTOR', `${output.dilemmas.length} dilemmas · ${output.dilemmas.filter((d) => d.confirmed).length} confirmed · ended=${output.ended} · ${output.moves_spent} moves`, Date.now() - t);

  // COMPILER
  t = Date.now();
  const brief = await compile(adapter, output);
  stage('COMPILER', `${brief.prose_brief.length} chars · cards: ${brief.drawn.cards.map((c) => c.card.name).join(' · ')}`, Date.now() - t);

  // SEER INTRO (optional — 1 actor call; director skipped via supplied brief)
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

  // ── contract checks ──
  console.log(kleur.cyan().bold('\nchecks'));
  check(raw.facets.length >= 10, `survey produced ${raw.facets.length} facets`);
  check(!condenserFellBack, 'condenser produced a real portrait (no fallback)');
  check(output.dilemmas.length >= 1, 'at least one dilemma banked');
  check(output.portrait_md.length > 0, 'bundle carries the portrait it hunted from');
  const moves = output.dilemmas.flatMap((d) => d.trail);
  const withDim = moves.filter((m) => (m.dimension ?? '').length > 0);
  check(withDim.length === moves.length, `every move carries a dimension (${withDim.length}/${moves.length})`);
  for (const d of output.dilemmas) {
    const dims = d.trail.filter((m) => m.kind === 'guess').map((m) => m.dimension ?? '?');
    console.log(`  ${kleur.gray(`thread ${d.id} dimensions:`)} ${dims.join(' → ') || '(no guesses)'}`);
  }
  check(brief.prose_brief.length > 400, 'compiled brief is substantive (>400 chars)');
  const briefLower = brief.prose_brief.toLowerCase();
  check(!brief.drawn.cards.some((c) => briefLower.includes(c.card.name.toLowerCase())), 'brief is card-blind (names no drawn card)');
  check(!/\bwound\b/.test(briefLower), 'brief avoids the banned register ("wound")');
  check(brief.intention.length > 0, `intention present: "${brief.intention}"`);

  // ── artifacts ──
  writeFileSync(`runs/e2e-${stamp}-bundle.json`, JSON.stringify(output, null, 2));
  writeFileSync(`runs/e2e-${stamp}-brief.json`, JSON.stringify(brief, null, 2));
  writeFileSync(`runs/e2e-${stamp}-transcript.md`, buildTranscript());
  console.log(kleur.gray(`\nartifacts: runs/e2e-${stamp}-{bundle.json, brief.json, transcript.md}`));

  if (failures.length > 0) {
    console.log(kleur.red().bold(`\n✗ ${failures.length} check(s) failed`));
    process.exit(1);
  }
  console.log(kleur.green().bold('\n✓ e2e passed — antechamber → compiler contract holds'));
}

main().catch((err) => {
  console.error(kleur.red().bold('\ne2e: fatal'));
  console.error(err);
  process.exit(1);
});
