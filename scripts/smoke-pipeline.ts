#!/usr/bin/env tsx
// Pipeline smoke test — fabricates a session and fires every agent in
// sequence to verify (a) parsers don't choke, (b) outputs look in-character,
// (c) the DilemmaDocument schema validates end-to-end.
//
// This is NOT a quality benchmark — outputs are printed for the human to
// eyeball. It's the cheapest way to verify the prompt-engineering overhauls
// (WEAVER, compiler-as-sieve, intention chips, WARM/COLD diviner) didn't
// break the contract between agents.
//
// Usage:
//   pnpm smoke -- --apiKey=sk-ant-...
//   pnpm smoke -- --apiKey=$ANTHROPIC_API_KEY --runs 3

import kleur from 'kleur';
import { createClaudeClient } from '../src/pipeline/claude';
import { AnthropicAdapter } from '../src/pipeline/llm/adapter-anthropic';
import { runDiviner, blobToQueuedGuess } from '../src/pipeline/antechamber/agents/diviner';
import { runWeaver } from '../src/pipeline/antechamber/agents/weaver';
import { runIntentionSuggestor } from '../src/pipeline/antechamber/intention-suggestor';
import { runCompiler, DilemmaDocumentSchema, type DilemmaDocument } from '../src/pipeline/antechamber/agents/compiler';
import type { TranscriptEntry } from '../src/pipeline/antechamber/transcript';
import type { EngineState, PickEvent, AntechamberProfile, VerbatimEntry, PotentialDilemma } from '../src/pipeline/antechamber/types';
import { EMPTY_DOC } from '../src/pipeline/antechamber/living-doc';

// ─── CLI ────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { apiKey?: string; runs: number } {
  const out: { apiKey?: string; runs: number } = { runs: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--apiKey=')) out.apiKey = arg.slice('--apiKey='.length);
    else if (arg === '--apiKey') out.apiKey = argv[++i];
    else if (arg.startsWith('--runs=')) out.runs = Number(arg.slice('--runs='.length));
    else if (arg === '--runs') out.runs = Number(argv[++i]);
  }
  return out;
}

// ─── Fabricated session ─────────────────────────────────────────

/** Returns a freshly fabricated state at end-of-pillars, ready for
 *  Interrogation. Persona: 32, librarian, partnered, considering
 *  quitting the day job to write full-time. Pillars answered with
 *  the kind of texture a real participant would supply. */
function makeFabricatedState(): EngineState {
  const profile: AntechamberProfile = {
    name: 'maren',
    birthday: { year: 1993, month: 7, day: 4 },
    sun_sign: 'cancer',
    life_path: 6,
    birth_card: { number: 6, name: 'the lovers' },
    age_bracket: '25-34',
    birth_time_bracket: 'afternoon_evening',
    relationship_status: 'in a relationship',
    initial_intention: 'should i leave my job to write full-time?',
    cast: [
      { label: 'theo', likely_role: 'partner', supporting_picks: ['center_of_life'], confidence: 'high' },
    ],
  };

  const verbatim_log: VerbatimEntry[] = [
    { index: 0, turn: 0, source: 'name', text: 'maren', captured_at: Date.now() },
    { index: 1, turn: 0, source: 'intent', text: 'should i leave my job to write full-time?', captured_at: Date.now() },
    { index: 2, turn: 4, source: 'relationship_label', text: 'theo', captured_at: Date.now() },
  ];

  const transcript: TranscriptEntry[] = [
    // Pillar 1: basics
    {
      kind: 'pick',
      pillar_idx: 1,
      question: 'how are the basics right now? housing, money, health,',
      options_shown: ['handled', 'mostly', 'some are not', 'very little'],
      picked: 'mostly',
      negative_space: ['handled', 'some are not', 'very little'],
      latency_ms: 3200,
      latency_z: 0.2,
    },
    // Pillar 2: attachment
    {
      kind: 'pick',
      pillar_idx: 2,
      question: 'when someone you love goes quiet, you—',
      options_shown: ['reach out', 'wait', 'assume the worst', 'let it go'],
      picked: 'assume the worst',
      negative_space: ['reach out', 'wait', 'let it go'],
      latency_ms: 4800,
      latency_z: 1.1,
    },
    // Pillar 3: body+mind
    {
      kind: 'pick',
      pillar_idx: 3,
      question: 'where are you, body and mind?',
      options_shown: ['grounded + present', 'grounded + dissociated', 'numb + present', 'numb + dissociated'],
      picked: 'numb + present',
      negative_space: ['grounded + present', 'grounded + dissociated', 'numb + dissociated'],
      latency_ms: 6100,
      latency_z: 1.8,
    },
    // Pillar 4: relational anchor
    {
      kind: 'pick',
      pillar_idx: 4,
      question: 'who\'s the center of your life right now?',
      options_shown: ['me', 'partner', 'parent or caretaker', 'sibling', 'friend', 'child', 'boss'],
      picked: 'partner',
      negative_space: ['me', 'parent or caretaker', 'sibling', 'friend', 'child', 'boss'],
      latency_ms: 2800,
      latency_z: -0.2,
    },
    // Pillar 5: want most
    {
      kind: 'pick',
      pillar_idx: 5,
      question: 'which of these do you want most?',
      options_shown: ['love', 'freedom', 'wisdom', 'beauty', 'security', 'belonging', 'power'],
      picked: 'freedom',
      negative_space: ['love', 'wisdom', 'beauty', 'security', 'belonging', 'power'],
      latency_ms: 5300,
      latency_z: 1.4,
    },
  ];

  return {
    session_id: `smoke_${Date.now()}`,
    started_at: Date.now(),
    tree_version: 'smoke',
    profile,
    doc: EMPTY_DOC,
    is_returning_user: false,
    prior_answered_node_ids: [],
    prior_intentions: [],
    queue: [],
    picks_log: [] as PickEvent[],
    timing_log: [],
    asked_node_ids: [],
    heat: 0,
    heat_history: [],
    phase: 'C',
    closed: false,
    thinking: false,
    stage: 'questions',
    intentions_offered: [],
    chosen_intention: null,
    anchor: '',
    verbatim_log,
    transcript,
    diviner_thinking: '',
    hypotheses: [],
    candidate_shapes: [],
    guess_queue: [],
    weaver_candidates: [],
    weaver_engagement: 'live',
    weaver_run_count: 0,
    dilemma: null,
    intention_suggestions: [],
    intention_suggestions_loading: false,
  };
}

// ─── Stage runner ───────────────────────────────────────────────

type StageResult = {
  name: string;
  pass: boolean;
  ms: number;
  detail: string;
  sample?: string;
};

function reportStage(r: StageResult): void {
  const tick = r.pass ? kleur.green('✓') : kleur.red('✗');
  const ms = kleur.gray(`${r.ms}ms`);
  console.log(`${tick} ${kleur.bold(r.name.padEnd(28))} ${ms}  ${r.detail}`);
  if (r.sample) {
    for (const line of r.sample.split('\n')) console.log(kleur.gray(`    │ ${line}`));
    console.log('');
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
}

// ─── The smoke run ──────────────────────────────────────────────

async function runOne(adapter: AnthropicAdapter, runIdx: number, totalRuns: number): Promise<StageResult[]> {
  const results: StageResult[] = [];
  console.log(kleur.cyan().bold(`\n═══ run ${runIdx + 1} of ${totalRuns} ═══\n`));
  let state = makeFabricatedState();

  // ── DIVINER (3 passes, with fake WARM/COLD responses between) ──
  for (let pass = 1; pass <= 3; pass++) {
    try {
      const { value: blob, ms } = await timed(() => runDiviner(adapter, { state }));
      const hasAll = blob.thinking.length > 0
        && blob.hypothesis.length > 0
        && blob.guess.length > 0;
      const queued = blobToQueuedGuess(blob, state.guess_queue.length + 1, 5 + pass);
      const passOk = hasAll && queued !== null;
      results.push({
        name: `DIVINER pass ${pass}`,
        pass: passOk,
        ms,
        detail: passOk
          ? `hypothesis present; A${queued?.idx} queued`
          : `missing sections: ${[!blob.thinking && 'thinking', !blob.hypothesis && 'hypothesis', !blob.guess && 'guess'].filter(Boolean).join(', ')}`,
        sample: `H: ${blob.hypothesis}\nA: ${blob.guess}`,
      });
      if (queued) {
        // Apply state update + fabricate a user response so the next
        // pass sees realistic continuity.
        const FAKE_RESPONSES = [
          { direction: 'warm' as const, correction: 'yes — but it\'s less the job, more what staying says about me' },
          { direction: 'warm' as const },
          { direction: 'cold' as const, correction: 'not theo — he wants me to do it' },
        ];
        const fake = FAKE_RESPONSES[pass - 1]!;
        state = {
          ...state,
          diviner_thinking: state.diviner_thinking + (state.diviner_thinking ? '\n\n' : '') + blob.thinking,
          hypotheses: blob.hypothesis ? [...state.hypotheses, blob.hypothesis] : state.hypotheses,
          guess_queue: [...state.guess_queue, queued],
          transcript: [
            ...state.transcript,
            { kind: 'guess', guess_idx: queued.idx, statement: queued.statement, hypothesis: blob.hypothesis },
            { kind: 'response', guess_idx: queued.idx, direction: fake.direction, ...(fake.correction ? { correction: fake.correction } : {}), latency_ms: 4500 },
          ],
          verbatim_log: fake.correction
            ? [...state.verbatim_log, { index: state.verbatim_log.length, turn: 5 + pass, source: 'correction', text: fake.correction, captured_at: Date.now() }]
            : state.verbatim_log,
        };
      }
    } catch (e) {
      results.push({ name: `DIVINER pass ${pass}`, pass: false, ms: 0, detail: `threw: ${String(e).slice(0, 400)}` });
      break;
    }
  }

  // ── WEAVER (fires after 2+ responses; fabricated state has 3) ──
  {
    try {
      const { value: blob, ms } = await timed(() => runWeaver(adapter, { state, run_total: 3 }));
      const labelsValid = blob.candidates.every((c) => /^[a-z][a-z0-9-]*$/.test(c.label));
      const allHaveThoughts = blob.candidates.every((c) => c.thoughts.length > 0);
      const anchoredEvidence = blob.candidates.every((c) =>
        c.thoughts.every((t) => /entry \d+|guess \d+|warm|cold/i.test(t)),
      );
      const passOk = blob.candidates.length > 0 && labelsValid && allHaveThoughts && anchoredEvidence;
      results.push({
        name: 'WEAVER',
        pass: passOk,
        ms,
        detail: passOk
          ? `${blob.candidates.length} candidates, engagement=${blob.engagement}`
          : `labels=${labelsValid} thoughts=${allHaveThoughts} anchored=${anchoredEvidence}`,
        sample: blob.candidates
          .map((c) => `${c.label}: ${c.description}\n  ${c.thoughts.slice(0, 2).join('\n  ')}`)
          .join('\n'),
      });
      state = {
        ...state,
        weaver_candidates: blob.candidates,
        weaver_engagement: blob.engagement,
        weaver_run_count: state.weaver_run_count + 1,
      };
    } catch (e) {
      results.push({ name: 'WEAVER', pass: false, ms: 0, detail: `threw: ${String(e).slice(0, 400)}` });
    }
  }

  // ── INTENTION SUGGESTOR (one per WEAVER candidate, parallel) ──
  {
    const candidates: PotentialDilemma[] = state.weaver_candidates;
    if (candidates.length === 0) {
      results.push({ name: 'INTENTION SUGGESTOR', pass: false, ms: 0, detail: 'no candidates from WEAVER' });
    } else {
      const start = Date.now();
      const settled = await Promise.allSettled(
        candidates.map((c) => runIntentionSuggestor(adapter, { state, candidate: c })),
      );
      const ms = Date.now() - start;
      const successes = settled
        .map((r) => (r.status === 'fulfilled' ? r.value : ''))
        .filter((s) => s.length > 0);
      const passOk = successes.length === candidates.length
        && successes.every((s) => s.length >= 10 && s.length <= 200)
        && successes.every((s) => !s.includes('"') && !s.includes('the cards') && !s.includes('tarot'));
      results.push({
        name: 'INTENTION SUGGESTOR',
        pass: passOk,
        ms,
        detail: passOk
          ? `${successes.length}/${candidates.length} suggestions`
          : `${successes.length}/${candidates.length} usable`,
        sample: successes.join('\n'),
      });
    }
  }

  // ── COMPILER (sieve, with a user intention) ──
  {
    const user_intention = state.profile.initial_intention ?? 'should i leave my job to write full-time?';
    try {
      const { value: doc, ms } = await timed(() =>
        runCompiler(adapter, { state, user_intention }, {}),
      );
      const valid = DilemmaDocumentSchema.safeParse(doc);
      const checks = checkDilemmaDocument(doc);
      const passOk = valid.success && checks.ok;
      results.push({
        name: 'COMPILER',
        pass: passOk,
        ms,
        detail: passOk
          ? `path=${doc.resolution_path}, confidence=${doc.confidence}, ${doc.critical_hypotheses.length} crit-hyps`
          : `${valid.success ? '' : 'schema invalid'} ${checks.issues.join(', ')}`,
        sample:
          `label:       ${doc.label}\n` +
          `delta:       ${doc.delta_description.slice(0, 200)}${doc.delta_description.length > 200 ? '…' : ''}\n` +
          `fork(no):    ${doc.fork.do_nothing_branch}\n` +
          `fork(alt):   ${doc.fork.alternative_branch}\n` +
          `awareness:   ${doc.awareness} · domains: ${doc.domain_tags.join(', ') || '∅'}\n` +
          `crit-hyps:   ${doc.critical_hypotheses.length}\n` +
          doc.critical_hypotheses.slice(0, 2).map((h) => `  - ${h.claim} _(${h.confidence})_\n    evidence: ${h.evidence}`).join('\n'),
      });
    } catch (e) {
      results.push({ name: 'COMPILER', pass: false, ms: 0, detail: `threw: ${String(e).slice(0, 400)}` });
    }
  }

  // Print all results for this run.
  console.log('');
  for (const r of results) reportStage(r);
  return results;
}

/** Cheap post-output checks on the DilemmaDocument. Catches the
 *  patterns most likely to drift under prompt churn — fork
 *  emptiness, unanchored critical hypotheses, "wound" leakage, etc. */
function checkDilemmaDocument(doc: DilemmaDocument): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!doc.null_landing) {
    if (!doc.fork.do_nothing_branch) issues.push('empty do_nothing_branch');
    if (!doc.fork.alternative_branch) issues.push('empty alternative_branch');
    if (doc.domain_tags.length === 0) issues.push('no domain_tags');
    if (doc.delta_description.length < 30) issues.push('delta too short');
  } else {
    if (doc.label !== 'no-dilemma-resolved') issues.push(`null_landing but label=${doc.label}`);
    if (doc.resolution_path !== 'null-landing') issues.push(`null_landing but path=${doc.resolution_path}`);
  }
  for (const h of doc.critical_hypotheses) {
    if (!/entry \d+|guess \d+|warm|cold|weaver/i.test(h.evidence)) {
      issues.push(`unanchored evidence on hypothesis: "${h.claim.slice(0, 40)}…"`);
    }
  }
  const blob = JSON.stringify(doc).toLowerCase();
  if (blob.includes('"wound"') || blob.includes(' wound ')) issues.push('contains "wound"');
  return { ok: issues.length === 0, issues };
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(kleur.red('smoke: --apiKey or ANTHROPIC_API_KEY required'));
    process.exit(1);
  }

  const client = createClaudeClient(apiKey);
  const adapter = new AnthropicAdapter(client);

  console.log(kleur.cyan().bold(`tarobot smoke — ${args.runs} run${args.runs === 1 ? '' : 's'}\n`));

  const allResults: StageResult[][] = [];
  for (let i = 0; i < args.runs; i++) {
    const run = await runOne(adapter, i, args.runs);
    allResults.push(run);
  }

  // Aggregate
  const stageNames = Array.from(new Set(allResults.flat().map((r) => r.name)));
  console.log(kleur.cyan().bold('\n═══ summary ═══\n'));
  for (const name of stageNames) {
    const rows = allResults.flat().filter((r) => r.name === name);
    const passes = rows.filter((r) => r.pass).length;
    const avgMs = Math.round(rows.reduce((s, r) => s + r.ms, 0) / Math.max(1, rows.length));
    const tick = passes === rows.length ? kleur.green('✓') : kleur.yellow('!');
    console.log(`${tick} ${kleur.bold(name.padEnd(28))} ${passes}/${rows.length} pass  ${kleur.gray(`avg ${avgMs}ms`)}`);
  }

  const total = allResults.flat().length;
  const passed = allResults.flat().filter((r) => r.pass).length;
  const overallPass = passed === total;
  console.log('');
  console.log(overallPass
    ? kleur.green().bold(`✓ all ${total} stages passed across ${args.runs} run${args.runs === 1 ? '' : 's'}`)
    : kleur.red().bold(`✗ ${total - passed} of ${total} stages failed`));

  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error(kleur.red().bold('\nsmoke: fatal'));
  console.error(err);
  process.exit(1);
});
