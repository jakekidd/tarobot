// Dowser agent — interrogation pivot.
//
// Single Opus call per dowser pass. Writes a free-form thinking
// trace followed by four labeled sections (===HYPOTHESES===,
// ===GUESS===, ===IF_WARMER===, ===IF_COLDER===). Engine parses
// the text blob, appends thinking to the running transcript,
// extracts hypotheses (re-listing = vote), enqueues the guess.
//
// Fires ONLY in Interrogation phase (post-pillars). The dowser
// holds the hunt — there is no observer / profiler anymore.

import type { LLMAdapter } from '../../../llm/adapter';
import { DOWSER_SYSTEM_TEMPLATE } from './prompt';
import { parseDowserTextBlob, type DowserTextBlob } from './parseTextBlob';
import { renderTranscript } from '../../transcript';
import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, QueuedGuess } from '../../types';

const OBJECTIVE_LINE =
  "find this person's live dilemma — a situation they face with a fork in it, where one branch is 'continue as you are.' assert situations and behaviors, not interior verdicts. profile the problem, not the person.";

export type RunDowserArgs = {
  state: EngineState;
};

export async function runDowser(
  adapter: LLMAdapter,
  args: RunDowserArgs,
): Promise<DowserTextBlob> {
  const { state } = args;
  const transcript = renderTranscript(state.transcript);
  const hypothesesSoFar = state.hypotheses.length > 0
    ? state.hypotheses.map((h) => `    ${h}`).join('\n')
    : '    (none yet)';
  const queue = state.guess_queue.length > 0
    ? state.guess_queue.map((q) => `    A${q.idx} (queued): ${q.statement}`).join('\n')
    : '    (queue empty — propose the first interrogation guess)';
  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';
  const thinkingSoFar = state.dowser_thinking.trim() || '(this is your first thinking pass — start fresh)';

  const system = DOWSER_SYSTEM_TEMPLATE
    .replace('{{OBJECTIVE}}', OBJECTIVE_LINE)
    .replace('{{TRANSCRIPT}}', transcript || '(no pillar answers yet)')
    .replace('{{HYPOTHESES_SO_FAR}}', hypothesesSoFar)
    .replace('{{GUESS_QUEUE}}', queue)
    .replace('{{VERBATIM_LOG}}', verbatim)
    .replace('{{DOWSER_THINKING_TRANSCRIPT}}', thinkingSoFar);

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'deep',
    max_tokens: 4000,
    label: 'dowser',
  });

  return parseDowserTextBlob(raw);
}

/** Helper for the engine: build a QueuedGuess from a parsed blob. */
export function blobToQueuedGuess(
  blob: DowserTextBlob,
  next_idx: number,
  emitted_at_turn: number,
): QueuedGuess | null {
  if (!blob.guess) return null;
  return {
    idx: next_idx,
    statement: blob.guess,
    comment_if_warm: blob.if_warm,
    comment_if_cold: blob.if_cold,
    comment_if_hot: blob.if_hot,
    emitted_at_turn,
  };
}
