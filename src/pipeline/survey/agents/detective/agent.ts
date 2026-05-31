// Detective agent — interrogation pivot.
//
// Single Opus call per detective pass. Writes a free-form thinking
// trace followed by four labeled sections (===HYPOTHESES===,
// ===ASSERTION===, ===IF_WARMER===, ===IF_COLDER===). Engine parses
// the text blob, appends thinking to the running transcript,
// extracts hypotheses (re-listing = vote), enqueues the assertion.
//
// Fires ONLY in Interrogation phase (post-pillars). The detective
// holds the hunt — there is no observer / profiler anymore.

import type { LLMAdapter } from '../../../llm/adapter';
import { DETECTIVE_SYSTEM_TEMPLATE } from './prompt';
import { parseDetectiveTextBlob, type DetectiveTextBlob } from './parseTextBlob';
import { renderTranscript } from '../../transcript';
import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, QueuedAssertion } from '../../types';

const OBJECTIVE_LINE =
  "find this person's live dilemma — a situation they face with a fork in it, where one branch is 'continue as you are.' assert situations and behaviors, not interior verdicts. profile the problem, not the person.";

export type RunDetectiveArgs = {
  state: EngineState;
};

export async function runDetective(
  adapter: LLMAdapter,
  args: RunDetectiveArgs,
): Promise<DetectiveTextBlob> {
  const { state } = args;
  const transcript = renderTranscript(state.transcript);
  const hypothesesSoFar = state.hypotheses.length > 0
    ? state.hypotheses.map((h) => `    ${h}`).join('\n')
    : '    (none yet)';
  const queue = state.assertion_queue.length > 0
    ? state.assertion_queue.map((q) => `    A${q.idx} (queued): ${q.statement}`).join('\n')
    : '    (queue empty — propose the first interrogation assertion)';
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';
  const thinkingSoFar = state.detective_thinking.trim() || '(this is your first thinking pass — start fresh)';

  const system = DETECTIVE_SYSTEM_TEMPLATE
    .replace('{{OBJECTIVE}}', OBJECTIVE_LINE)
    .replace('{{TRANSCRIPT}}', transcript || '(no pillar answers yet)')
    .replace('{{HYPOTHESES_SO_FAR}}', hypothesesSoFar)
    .replace('{{ASSERTION_QUEUE}}', queue)
    .replace('{{VERBATIM_LOG}}', verbatim)
    .replace('{{DETECTIVE_THINKING_TRANSCRIPT}}', thinkingSoFar);

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'deep',
    max_tokens: 4000,
    label: 'detective',
  });

  return parseDetectiveTextBlob(raw);
}

/** Helper for the engine: build a QueuedAssertion from a parsed blob. */
export function blobToQueuedAssertion(
  blob: DetectiveTextBlob,
  next_idx: number,
  emitted_at_turn: number,
): QueuedAssertion | null {
  if (!blob.assertion) return null;
  return {
    idx: next_idx,
    statement: blob.assertion,
    comment_if_warm: blob.if_warm,
    comment_if_cold: blob.if_cold,
    comment_if_hot: blob.if_hot,
    emitted_at_turn,
  };
}
