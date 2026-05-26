// PSYCH agent — Haiku, freeform text-blob output. Fires every 2 answered
// assertions during Interrogation. Maintains state.psych_candidates as a
// small set; engine replaces the set wholesale on each call (re-listing
// is the vote signal). Also owns the engagement early-out via the
// TERMINATE section in the output.

import type { LLMAdapter } from '../../../llm/adapter';
import { PSYCH_SYSTEM_TEMPLATE } from './prompt';
import { parsePsychTextBlob, type PsychTextBlob } from './parseTextBlob';
import { renderTranscript } from '../../transcript';
import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, PotentialDilemma } from '../../types';

export type RunPsychArgs = {
  state: EngineState;
  /** Expected total PSYCH calls across this Interrogation. Surfaced
   *  into the prompt for calibration (early = exploratory, late =
   *  consolidate). Computed by the engine from SOFT_CEILING / cadence. */
  run_total: number;
};

export async function runPsych(
  adapter: LLMAdapter,
  args: RunPsychArgs,
): Promise<PsychTextBlob> {
  const { state, run_total } = args;
  const transcript = renderTranscript(state.transcript) || '(no transcript yet)';
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';
  const detectiveHypotheses = state.hypotheses.length > 0
    ? state.hypotheses.map((h) => `    ${h}`).join('\n')
    : '    (none yet)';
  const psychSoFar = formatPsychCandidatesForPrompt(state.psych_candidates);
  const runIdx = state.psych_run_count + 1;

  const system = PSYCH_SYSTEM_TEMPLATE
    .replace('{{TRANSCRIPT}}', transcript)
    .replace('{{VERBATIM_LOG}}', verbatim)
    .replace('{{DETECTIVE_HYPOTHESES}}', detectiveHypotheses)
    .replace('{{PSYCH_CANDIDATES_SO_FAR}}', psychSoFar)
    .replace('{{RUN_IDX}}', String(runIdx))
    .replace('{{RUN_TOTAL}}', String(run_total));

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'fast',
    max_tokens: 1500,
    label: 'psych',
  });

  return parsePsychTextBlob(raw);
}

/** Render the prior candidate set for PSYCH's next call, in the same
 *  format the agent emits. Round-trips through the parser. */
export function formatPsychCandidatesForPrompt(set: PotentialDilemma[]): string {
  if (set.length === 0) return '    (none yet — first call, build the set from scratch)';
  const lines: string[] = [];
  for (const c of set) {
    lines.push(`    ${c.label}: ${c.description}`);
    for (const t of c.thoughts) {
      lines.push(`        ${t}`);
    }
  }
  return lines.join('\n');
}
