// Intention-suggestion helper — thin wrapper around invokeFreeform.
//
// Wave 2 of the compiler-as-sieve refactor: after PSYCH has settled
// (via waitForPsychQuiescence in beginIntentionStage), the engine
// fires one of these per PotentialDilemma in parallel. Each call
// produces a single short sentence the user could plausibly have
// typed at the intent screen — first-person, evidence-anchored, in
// the user's own register.
//
// The resulting strings render as clickable chips below the intent
// input. Clicking a chip submits that intention directly; the user
// can still type their own.
//
// Tier: cognition (Sonnet) — these are user-visible and need to land
// with specific texture, not generic shapes. Cheap because they're
// short and parallel; latency hides behind the user reading the
// intent screen.

import type { LLMAdapter } from '../llm/adapter';
import { formatVerbatimLog } from './verbatim-log';
import type { EngineState, PotentialDilemma } from './types';
import INTENTION_SUGGESTOR_RAW from '../../../materials/prompts/intention-suggestor.md?raw';

export async function runIntentionSuggestor(
  adapter: LLMAdapter,
  args: { state: EngineState; candidate: PotentialDilemma },
): Promise<string> {
  const { state, candidate } = args;
  const thoughtLines = candidate.thoughts.length > 0
    ? candidate.thoughts.map((t) => `    - ${t}`).join('\n')
    : '    (no thoughts yet)';
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';

  const system = INTENTION_SUGGESTOR_RAW
    .replace('{{LABEL}}', candidate.label)
    .replace('{{DESCRIPTION}}', candidate.description)
    .replace('{{THOUGHTS}}', thoughtLines)
    .replace('{{VERBATIM}}', verbatim);

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'cognition',
    max_tokens: 150,
    label: 'intention_suggestor',
  });

  return cleanupSuggestion(raw);
}

/** Strip model wrappers: leading bullets/quotes/preamble, trailing
 *  whitespace. Returns the first non-empty cleaned line. Exported for
 *  unit testing — the per-line tolerance for model variability lives
 *  here and benefits from explicit coverage. */
export function cleanupSuggestion(raw: string): string {
  for (const line of raw.split('\n')) {
    const trimmed = line
      .trim()
      .replace(/^[-*•·]+\s*/, '')
      .replace(/^["'`]+/, '')
      .replace(/["'`]+$/, '');
    if (trimmed.length === 0) continue;
    // Defensive lowercase to match the survey's register, regardless of
    // what the model emits. The prompt asks for lowercase but enforce.
    return trimmed.toLowerCase();
  }
  return '';
}
