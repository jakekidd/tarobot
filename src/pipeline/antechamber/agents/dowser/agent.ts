// Dowser agent — Sounding phase.
//
// Single Opus call per dowser pass. Writes a free-form thinking
// trace followed by two labeled sections (===HYPOTHESIS===,
// ===GUESS===). Engine parses the text blob, appends thinking to the
// running transcript, captures the singular hypothesis on the
// QueuedGuess (where it travels with the guess to the user), and
// enqueues the guess.
//
// Fires ONLY in the Sounding phase (post-pillars). The dowser holds
// the hunt — there is no observer / profiler anymore.

import type { LLMAdapter } from '../../../llm/adapter';
import { DOWSER_SYSTEM_TEMPLATE } from './prompt';
import { parseDowserTextBlob, type DowserTextBlob } from './parseTextBlob';
import { renderTranscript } from '../../transcript';
import type { EngineState, QueuedGuess } from '../../types';

const GUESS_BUDGET = 20;
/** Guesses 1-N of the Sounding sit in LOCATE: the prompt requires a
 *  fresh hypothesis each turn so the dowser surveys breadth before
 *  narrowing. Guess N+1 onward sits in COMPOSE: free to follow /
 *  extend / contradict / replace prior hypotheses. */
const LOCATE_GUESS_COUNT = 5;

export type RunDowserArgs = {
  state: EngineState;
};

export async function runDowser(
  adapter: LLMAdapter,
  args: RunDowserArgs,
): Promise<DowserTextBlob> {
  const { state } = args;
  const transcript = renderTranscript(state.transcript);
  const guessHistory = renderGuessHistory(state);

  const candidateShapes = state.candidate_shapes.length > 0
    ? state.candidate_shapes.map((s, i) => `    ${i + 1}. ${s}`).join('\n')
    : '    (none banked yet)';

  const thinkingSoFar = state.dowser_thinking.trim() || '(first thinking pass — start fresh)';
  const allegedProblem = '(none — user did not vent)';

  // Guesses already voiced + queued; the upcoming guess will be the next.
  const guessesUsed = state.transcript.filter((e) => e.kind === 'guess').length + state.guess_queue.length;
  const guessesLeft = Math.max(0, GUESS_BUDGET - guessesUsed);
  const upcomingGuessIdx = guessesUsed + 1;
  const phase = upcomingGuessIdx <= LOCATE_GUESS_COUNT ? 'LOCATE' : 'COMPOSE';

  const system = DOWSER_SYSTEM_TEMPLATE
    .replace('{{PHASE}}', phase)
    .replace('{{GUESS_INDEX}}', String(upcomingGuessIdx))
    .replace('{{GUESS_BUDGET_LEFT}}', String(guessesLeft))
    .replace('{{TRANSCRIPT}}', transcript || '(no pillar answers yet)')
    .replace('{{ALLEGED_PROBLEM}}', allegedProblem)
    .replace('{{GUESS_HISTORY}}', guessHistory)
    .replace('{{CANDIDATE_SHAPES}}', candidateShapes)
    .replace('{{DOWSER_THINKING}}', thinkingSoFar);

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'deep',
    max_tokens: 4000,
    label: 'dowser',
  });

  return parseDowserTextBlob(raw);
}

/** Render the (hypothesis, guess, response) trajectory the dowser
 *  reads back. Includes answered turns from the transcript and any
 *  still-queued guesses awaiting response. */
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
      response: '(queued — no response yet)',
    });
  }
  if (entries.length === 0) {
    return '    (no guesses yet — this is the first turn)';
  }
  return entries
    .map((e) => {
      const lines: string[] = [`[${e.idx}]`];
      lines.push(`    hypothesis: ${e.hypothesis || '(blank)'}`);
      lines.push(`    guess:      ${e.guess}`);
      const correction = e.correction ? `  —  "${e.correction}"` : '';
      lines.push(`    response:   ${e.response}${correction}`);
      return lines.join('\n');
    })
    .join('\n\n');
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
    hypothesis: blob.hypothesis,
    emitted_at_turn,
  };
}
