#!/usr/bin/env tsx
// Prompt preview — renders each agent's fully-substituted system prompt
// against a fabricated state, so we can audit the prompts statically
// (no API calls, no credits). Pipe into a file for inspection:
//
//   pnpm preview > preview.txt
//
// Or filter to a single agent:
//
//   pnpm preview -- --only=dowser
//
// Catches things that fail silently in live calls — placeholders that
// didn't get substituted, transcript continuity gaps, missing fields,
// labels that drift between prompt + state.

import { DOWSER_SYSTEM_TEMPLATE } from '../src/pipeline/antechamber/agents/dowser';
import { WEAVER_SYSTEM_TEMPLATE } from '../src/pipeline/antechamber/agents/weaver';
import {
  formatWeaverCandidatesForPrompt,
} from '../src/pipeline/antechamber/agents/weaver/agent';
import { COMPILER_SYSTEM, buildCompilerPayload } from '../src/pipeline/antechamber/agents/compiler';
import INTENTION_SUGGESTOR_RAW from '../materials/prompts/intention-suggestor.md?raw';
import { renderTranscript } from '../src/pipeline/antechamber/transcript';
import { formatVerbatimLog } from '../src/pipeline/antechamber/verbatim-log';
import type {
  EngineState,
  PickEvent,
  PotentialDilemma,
  AntechamberProfile,
  VerbatimEntry,
} from '../src/pipeline/antechamber/types';
import type { TranscriptEntry } from '../src/pipeline/antechamber/transcript';
import { EMPTY_DOC } from '../src/pipeline/antechamber/living-doc';

// ─── Fabricated state ───────────────────────────────────────────

function makeState(): EngineState {
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
    { index: 0, turn: 0, source: 'name', text: 'maren', captured_at: 0 },
    { index: 1, turn: 0, source: 'intent', text: 'should i leave my job to write full-time?', captured_at: 0 },
    { index: 2, turn: 4, source: 'relationship_label', text: 'theo', captured_at: 0 },
    { index: 3, turn: 6, source: 'correction', text: 'less the job, more what staying says about me', captured_at: 0 },
    { index: 4, turn: 7, source: 'correction', text: 'not theo — he wants me to do it', captured_at: 0 },
  ];

  const transcript: TranscriptEntry[] = [
    { kind: 'pick', pillar_idx: 1, question: 'how are the basics right now?', options_shown: ['handled', 'mostly', 'some are not', 'very little'], picked: 'mostly', negative_space: ['handled', 'some are not', 'very little'], latency_ms: 3200, latency_z: 0.2 },
    { kind: 'pick', pillar_idx: 2, question: 'when someone you love goes quiet, you—', options_shown: ['reach out', 'wait', 'assume the worst', 'let it go'], picked: 'assume the worst', negative_space: ['reach out', 'wait', 'let it go'], latency_ms: 4800, latency_z: 1.1 },
    { kind: 'pick', pillar_idx: 3, question: 'where are you, body and mind?', options_shown: ['grounded + present', 'grounded + dissociated', 'numb + present', 'numb + dissociated'], picked: 'numb + present', negative_space: ['grounded + present', 'grounded + dissociated', 'numb + dissociated'], latency_ms: 6100, latency_z: 1.8 },
    { kind: 'pick', pillar_idx: 4, question: "who's the center of your life right now?", options_shown: ['me', 'partner', 'parent or caretaker', 'sibling', 'friend', 'child', 'boss'], picked: 'partner', negative_space: ['me', 'parent or caretaker', 'sibling', 'friend', 'child', 'boss'], latency_ms: 2800, latency_z: -0.2 },
    { kind: 'pick', pillar_idx: 5, question: 'which of these do you want most?', options_shown: ['love', 'freedom', 'wisdom', 'beauty', 'security', 'belonging', 'power'], picked: 'freedom', negative_space: ['love', 'wisdom', 'beauty', 'security', 'belonging', 'power'], latency_ms: 5300, latency_z: 1.4 },
    // Two guesses + responses to give WEAVER something to chew on.
    { kind: 'guess', guess_idx: 1, statement: 'the part of you that won\'t quit isn\'t afraid of theo\'s reaction. it\'s afraid of who you become if you do.' },
    { kind: 'response', guess_idx: 1, direction: 'warm', correction: 'less the job, more what staying says about me', latency_ms: 4200 },
    { kind: 'guess', guess_idx: 2, statement: 'staying lets you keep being the person who is still figuring it out, instead of the person whose work just is what it is.' },
    { kind: 'response', guess_idx: 2, direction: 'cold', correction: 'not theo — he wants me to do it', latency_ms: 3800 },
  ];

  const weaver_candidates: PotentialDilemma[] = [
    {
      label: 'staying-as-self-protection',
      description: 'the day-job is a hedge against a version of herself she\'s not sure she wants to be',
      thoughts: [
        'warm on guess 1; entry 3 — "less the job, more what staying says about me"',
        'numb + present on pillar 3 (z=1.8) suggests intellectualizing the choice',
      ],
    },
    {
      label: 'freedom-vs-belonging-with-theo',
      description: 'picked freedom over love+belonging despite theo being the gravity',
      thoughts: [
        'warm on guess 1; entry 4 — theo "wants me to do it"',
        'cold on guess 2 (theo-as-obstacle) eliminated the external-resistance region',
      ],
    },
  ];

  return {
    session_id: 's',
    started_at: 0,
    tree_version: 'preview',
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
    dowser_thinking: 'Earlier I noted she picked freedom over security — that\'s telling given the job framing. The latency on the body question (z=1.8) was the strongest pillar tell. My first guess targeted identity-cost-of-staying and earned a corrected warm.',
    hypotheses: [
      'she stays for security even though she picked freedom',
      'staying in the job is doing identity work she doesn\'t want to admit',
      'theo is supportive — the resistance is internal',
    ],
    guess_queue: [],
    weaver_candidates,
    weaver_engagement: 'live',
    weaver_run_count: 1,
    dilemma: null,
    intention_suggestions: [],
    intention_suggestions_loading: false,
  };
}

// ─── Renderers (mirror each agent's payload-building logic) ─────

function renderDowserPrompt(state: EngineState): string {
  const transcript = renderTranscript(state.transcript);
  const hypothesesSoFar = state.hypotheses.map((h) => `    ${h}`).join('\n');
  const queue = '    (queue empty — propose the first interrogation guess)';
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';
  const thinkingSoFar = state.dowser_thinking || '(this is your first thinking pass — start fresh)';
  const OBJECTIVE = "find this person's live dilemma — a situation they face with a fork in it, where one branch is 'continue as you are.' assert situations and behaviors, not interior verdicts. profile the problem, not the person.";
  return DOWSER_SYSTEM_TEMPLATE
    .replace('{{OBJECTIVE}}', OBJECTIVE)
    .replace('{{TRANSCRIPT}}', transcript || '(no pillar answers yet)')
    .replace('{{HYPOTHESES_SO_FAR}}', hypothesesSoFar)
    .replace('{{GUESS_QUEUE}}', queue)
    .replace('{{VERBATIM_LOG}}', verbatim)
    .replace('{{DOWSER_THINKING_TRANSCRIPT}}', thinkingSoFar);
}

function renderWeaverPrompt(state: EngineState): string {
  const transcript = renderTranscript(state.transcript) || '(no transcript yet)';
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';
  const dowserHypotheses = state.hypotheses.map((h) => `    ${h}`).join('\n') || '    (none yet)';
  const weaverSoFar = formatWeaverCandidatesForPrompt(state.weaver_candidates);
  return WEAVER_SYSTEM_TEMPLATE
    .replace('{{TRANSCRIPT}}', transcript)
    .replace('{{VERBATIM_LOG}}', verbatim)
    .replace('{{DOWSER_HYPOTHESES}}', dowserHypotheses)
    .replace('{{WEAVER_CANDIDATES_SO_FAR}}', weaverSoFar)
    .replace('{{RUN_IDX}}', String(state.weaver_run_count + 1))
    .replace('{{RUN_TOTAL}}', '3');
}

function renderIntentionSuggestorPrompt(state: EngineState, idx: number): string {
  const c = state.weaver_candidates[idx]!;
  const thoughtLines = c.thoughts.map((t) => `    - ${t}`).join('\n');
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';
  return INTENTION_SUGGESTOR_RAW
    .replace('{{LABEL}}', c.label)
    .replace('{{DESCRIPTION}}', c.description)
    .replace('{{THOUGHTS}}', thoughtLines)
    .replace('{{VERBATIM}}', verbatim);
}

function renderCompilerPayload(state: EngineState): { system: string; user: string } {
  const user_intention = state.profile.initial_intention;
  const payload = buildCompilerPayload({ state, user_intention });
  return { system: COMPILER_SYSTEM, user: JSON.stringify(payload, null, 2) };
}

// ─── Main ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): { only?: string } {
  const out: { only?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--only=')) out.only = arg.slice('--only='.length);
    else if (arg === '--only') out.only = argv[++i];
  }
  return out;
}

function banner(title: string): void {
  console.log('\n' + '═'.repeat(80));
  console.log(`  ${title}`);
  console.log('═'.repeat(80) + '\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const state = makeState();
  const want = (name: string) => !args.only || args.only === name;

  if (want('dowser')) {
    banner('DOWSER (Opus, freeform, Interrogation phase — first pass after pillars)');
    console.log(renderDowserPrompt(state));
  }

  if (want('weaver')) {
    banner('WEAVER (Haiku, freeform, run 2/3 — after 2 answered guesses)');
    console.log(renderWeaverPrompt(state));
  }

  if (want('intention')) {
    banner('INTENTION SUGGESTOR — candidate #1 (staying-as-self-protection)');
    console.log(renderIntentionSuggestorPrompt(state, 0));
    banner('INTENTION SUGGESTOR — candidate #2 (freedom-vs-belonging-with-theo)');
    console.log(renderIntentionSuggestorPrompt(state, 1));
  }

  if (want('compiler')) {
    const { system, user } = renderCompilerPayload(state);
    banner('COMPILER — SYSTEM');
    console.log(system);
    banner('COMPILER — USER PAYLOAD');
    console.log(user);
  }
}

main();
