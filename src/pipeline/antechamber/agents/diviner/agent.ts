// Diviner agent — Sounding phase.
//
// One Opus call per turn. In LOCATE the engine asks for a BATCH of
// guesses (3, then 2) so breadth is forced inside a single generation
// (the model can't write three near-identical guesses in one breath the
// way it drifts back to one thread across separate calls). In COMPOSE it
// asks for one, conditioned on the responses so far. The call writes a
// free-form thinking trace followed by `count` ===GUESS=== blocks
// (hypothesis / guess / predict). The engine parses + enqueues them.
//
// Fires ONLY in the Sounding phase (post-pillars). The diviner holds the
// hunt; there is no observer / profiler.

import type { LLMAdapter } from '../../../llm/adapter';
import { DIVINER_SYSTEM_TEMPLATE } from './prompt';
import { parseDivinerTextBlob, type DivinerTextBlob } from './parseTextBlob';
import { renderTranscript } from '../../transcript';
import type { EngineState, QueuedGuess } from '../../types';

export const GUESS_BUDGET = 20;
/** Guesses 1..LOCATE_GUESS_COUNT sit in LOCATE (forced breadth, emitted
 *  in batches of 3 then 2); the rest sit in COMPOSE (one per turn,
 *  drilling toward the concrete). */
export const LOCATE_GUESS_COUNT = 5;

export type RunDivinerArgs = {
  state: EngineState;
  /** How many guesses to produce this turn (LOCATE: 3 then 2; COMPOSE: 1). */
  count: number;
};

export async function runDiviner(
  adapter: LLMAdapter,
  args: RunDivinerArgs,
): Promise<DivinerTextBlob> {
  const { state, count } = args;
  const transcript = renderTranscript(state.transcript);
  const guessHistory = renderGuessHistory(state);

  const candidateShapes = state.candidate_shapes.length > 0
    ? state.candidate_shapes.map((s, i) => `    ${i + 1}. ${s}`).join('\n')
    : '    (none banked yet)';

  const thinkingSoFar = state.diviner_thinking.trim() || '(first thinking pass; start fresh)';
  const allegedProblem = '(none; user did not vent)';

  const guessesUsed = state.transcript.filter((e) => e.kind === 'guess').length + state.guess_queue.length;
  const guessesLeft = Math.max(0, GUESS_BUDGET - guessesUsed - count);
  const phase = guessesUsed < LOCATE_GUESS_COUNT ? 'LOCATE' : 'COMPOSE';

  const system = DIVINER_SYSTEM_TEMPLATE
    .replace(/\{\{COUNT\}\}/g, String(count))
    .replace('{{PHASE}}', phase)
    .replace('{{GUESSES_USED}}', String(guessesUsed))
    .replace('{{GUESS_BUDGET_LEFT}}', String(guessesLeft))
    .replace('{{TRANSCRIPT}}', transcript || '(no pillar answers yet)')
    .replace('{{ALLEGED_PROBLEM}}', allegedProblem)
    .replace('{{GUESS_HISTORY}}', guessHistory)
    .replace('{{CANDIDATE_SHAPES}}', candidateShapes)
    .replace('{{DIVINER_THINKING}}', thinkingSoFar);

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'deep',
    max_tokens: 4000,
    label: 'diviner',
  });

  return parseDivinerTextBlob(raw);
}

/** Render the (hypothesis, guess, response) trajectory the diviner reads
 *  back. Includes answered turns from the transcript and any still-queued
 *  guesses awaiting response. */
function renderGuessHistory(state: EngineState): string {
  type Entry = { idx: number; hypothesis: string; guess: string; response: string; correction?: string };
  const entries: Entry[] = [];
  let pending: { idx: number; hypothesis: string; guess: string } | null = null;
  for (const t of state.transcript) {
    if (t.kind === 'guess') {
      pending = { idx: t.guess_idx, hypothesis: t.hypothesis || '', guess: t.statement };
    } else if (t.kind === 'response' && pending) {
      entries.push({
        idx: pending.idx,
        hypothesis: pending.hypothesis,
        guess: pending.guess,
        response: t.direction.toUpperCase(),
        ...(t.correction ? { correction: t.correction } : {}),
      });
      pending = null;
    }
  }
  for (const q of state.guess_queue) {
    entries.push({
      idx: q.idx,
      hypothesis: q.hypothesis,
      guess: q.statement,
      response: '(queued; no response yet)',
    });
  }
  if (entries.length === 0) {
    return '    (no guesses yet; this is the first turn)';
  }
  return entries
    .map((e) => {
      const lines: string[] = [`[${e.idx}]`];
      lines.push(`    hypothesis: ${e.hypothesis || '(blank)'}`);
      lines.push(`    guess:      ${e.guess}`);
      const correction = e.correction ? `  ("${e.correction}")` : '';
      lines.push(`    response:   ${e.response}${correction}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

/** Build QueuedGuesses from a parsed blob, indexed from start_idx. The
 *  engine appends them to guess_queue in order. */
export function blobToQueuedGuesses(
  blob: DivinerTextBlob,
  start_idx: number,
  emitted_at_turn: number,
): QueuedGuess[] {
  return blob.guesses.map((g, i) => ({
    idx: start_idx + i,
    statement: g.guess,
    hypothesis: g.hypothesis,
    ...(g.predicted_response ? { predicted_response: g.predicted_response } : {}),
    emitted_at_turn,
  }));
}
