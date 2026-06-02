// WEAVER agent — Haiku, freeform text-blob output. Fires every 2 answered
// guesses during Interrogation. Maintains state.weaver_candidates as
// a small set; engine replaces the set wholesale on each call (re-listing
// is the persistence signal). Also owns the engagement early-out via the
// TERMINATE section in the output.
//
// (Was 'PSYCH' through the compiler-as-sieve wave. Renamed to WEAVER
// to match the role-coded naming style of dowser/compiler/augur/seer
// — the agent weaves anchored evidence into candidate-dilemma threads.)

import type { LLMAdapter } from '../../../llm/adapter';
import { WEAVER_SYSTEM_TEMPLATE } from './prompt';
import { parseWeaverTextBlob, type WeaverTextBlob } from './parseTextBlob';
import { renderTranscript } from '../../transcript';
import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, PotentialDilemma } from '../../types';

export type RunWeaverArgs = {
  state: EngineState;
  /** Expected total WEAVER calls across this Interrogation. Surfaced
   *  into the prompt for calibration (early = exploratory, late =
   *  consolidate). Computed by the engine from SOFT_CEILING / cadence. */
  run_total: number;
};

export async function runWeaver(
  adapter: LLMAdapter,
  args: RunWeaverArgs,
): Promise<WeaverTextBlob> {
  const { state, run_total } = args;
  const transcript = renderTranscript(state.transcript) || '(no transcript yet)';
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';
  const dowserHypotheses = state.hypotheses.length > 0
    ? state.hypotheses.map((h) => `    ${h}`).join('\n')
    : '    (none yet)';
  const weaverSoFar = formatWeaverCandidatesForPrompt(state.weaver_candidates);
  const runIdx = state.weaver_run_count + 1;

  const system = WEAVER_SYSTEM_TEMPLATE
    .replace('{{TRANSCRIPT}}', transcript)
    .replace('{{VERBATIM_LOG}}', verbatim)
    .replace('{{DOWSER_HYPOTHESES}}', dowserHypotheses)
    .replace('{{WEAVER_CANDIDATES_SO_FAR}}', weaverSoFar)
    .replace('{{RUN_IDX}}', String(runIdx))
    .replace('{{RUN_TOTAL}}', String(run_total));

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'fast',
    max_tokens: 1500,
    label: 'weaver',
  });

  return parseWeaverTextBlob(raw);
}

/** Render the prior candidate set for WEAVER's next call, in the same
 *  format the agent emits. Round-trips through the parser. */
export function formatWeaverCandidatesForPrompt(set: PotentialDilemma[]): string {
  if (set.length === 0) return '    (none yet — first call, weave the set from scratch)';
  const lines: string[] = [];
  for (const c of set) {
    lines.push(`    ${c.label}: ${c.description}`);
    for (const t of c.thoughts) {
      lines.push(`        ${t}`);
    }
  }
  return lines.join('\n');
}
