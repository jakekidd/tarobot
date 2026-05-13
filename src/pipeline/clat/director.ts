import type { ClatNote, Survey, SurveyAnswer, SurveyQuestion } from '../types';
import { QUESTION_POOL } from './pool';

// Pure logic. No LLM. Picks questions from the pool with category coverage,
// drains the Clat-agent injection queue (priority lane), maintains a
// comment queue and Clat's notepad.

export type DirectorState = {
  pool: SurveyQuestion[];
  answered_ids: Set<string>;
  injected_queue: SurveyQuestion[];   // Clat-agent inserts here; drained first
  answer_log: SurveyAnswer[];
  category_counts: Record<string, number>;
  identity_questions_required: string[];   // must always ask these in order

  // Clat's outputs accumulate here. Survey UI reads them.
  comment_queue: string[];             // FIFO; capped at COMMENT_QUEUE_CAP, oldest pruned
  clat_notes: ClatNote[];              // append-only freeform observations for Compiler
  clat_last_seen_count: number;        // # of answers the last Clat fire saw
};

export function newDirector(): DirectorState {
  return {
    pool: QUESTION_POOL,
    answered_ids: new Set(),
    injected_queue: [],
    answer_log: [],
    category_counts: {},
    // Order matters — these are asked in sequence before pool RNG kicks in.
    // Deliberately projective/register-setting to avoid locking cognition
    // onto a single domain before any context exists.
    identity_questions_required: [
      'name-input',          // necessary identity
      'birthday',            // unlocks sun sign + life path + tarot birth card
      'birth-order',         // factual, high-signal, robust predictor
      // want-from-reading: kept in pool but no longer forced up front — felt
      //   register-y when asked cold, before clat has any context to react to.
      // familiar: same — picking a creature is a vibe check, not an opener.
    ],
    comment_queue: [],
    clat_notes: [],
    clat_last_seen_count: 0,
  };
}

export const SURVEY_END_OFFER_AT = 20;
export const SURVEY_HARD_CAP = 50;
export const COMMENT_QUEUE_CAP = 5;
export const CLAT_HOLD_FOR_FIRST_N_ANSWERS = 3;

export function answeredCount(state: DirectorState): number {
  return state.answered_ids.size;
}

export function canEnd(state: DirectorState): boolean {
  return answeredCount(state) >= SURVEY_END_OFFER_AT;
}

export function mustEnd(state: DirectorState): boolean {
  return answeredCount(state) >= SURVEY_HARD_CAP;
}

/** Apply a user answer. Pure: returns updated state. */
export function applyAnswer(state: DirectorState, answer: SurveyAnswer): DirectorState {
  const q = state.pool.find((x) => x.id === answer.question_id);
  const cat = q?.category ?? 'other';
  return {
    ...state,
    answered_ids: new Set([...state.answered_ids, answer.question_id]),
    answer_log: [...state.answer_log, answer],
    category_counts: { ...state.category_counts, [cat]: (state.category_counts[cat] ?? 0) + 1 },
  };
}

/**
 * Inject a Clat-agent-generated question into the priority lane.
 * Adds to the FRONT — newer Clat thoughts jump the line. The director
 * always drains injected_queue before touching the pool.
 */
export function inject(state: DirectorState, q: SurveyQuestion): DirectorState {
  return { ...state, injected_queue: [q, ...state.injected_queue] };
}

/** Push a Clat comment to the tail of the FIFO queue. Prunes oldest if over cap. */
export function pushComment(state: DirectorState, comment: string): DirectorState {
  const next = [...state.comment_queue, comment];
  return {
    ...state,
    comment_queue: next.length > COMMENT_QUEUE_CAP ? next.slice(-COMMENT_QUEUE_CAP) : next,
  };
}

/** Pop the head of the comment queue. Returns { comment, state }. */
export function popComment(state: DirectorState): { comment: string | null; state: DirectorState } {
  if (state.comment_queue.length === 0) return { comment: null, state };
  const [head, ...rest] = state.comment_queue;
  return { comment: head ?? null, state: { ...state, comment_queue: rest } };
}

/** Append Clat profile notes (additive). */
export function appendClatNotes(state: DirectorState, notes: ClatNote[]): DirectorState {
  if (notes.length === 0) return state;
  return { ...state, clat_notes: [...state.clat_notes, ...notes] };
}

/** Mark how many answers Clat has seen — gates the polling loop. */
export function markClatSawN(state: DirectorState, n: number): DirectorState {
  return { ...state, clat_last_seen_count: Math.max(state.clat_last_seen_count, n) };
}

/**
 * Pick the next question. Identity questions go first (in their declared
 * order). Then drain the injected priority lane. Then RNG-pick from the
 * pool, weighted to favor categories with the lowest current count.
 */
export function nextQuestion(
  state: DirectorState,
  rng: () => number = Math.random,
): SurveyQuestion | null {
  // Identity priority
  for (const id of state.identity_questions_required) {
    if (!state.answered_ids.has(id)) {
      const q = state.pool.find((x) => x.id === id);
      if (q) return q;
    }
  }

  // Drain priority lane (Clat-injected, front-first)
  if (state.injected_queue.length > 0) {
    return state.injected_queue[0]!;
  }

  // RNG from pool — bias away from already-answered + saturated categories
  const candidates = state.pool.filter((q) => !state.answered_ids.has(q.id));
  if (candidates.length === 0) return null;

  const weights = candidates.map((q) => {
    const c = state.category_counts[q.category] ?? 0;
    return 1 / (1 + c);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

/** Drain the injected queue head — only after that question is delivered. */
export function consumeInjected(state: DirectorState): DirectorState {
  if (state.injected_queue.length === 0) return state;
  return { ...state, injected_queue: state.injected_queue.slice(1) };
}

/** Finalise the survey log into a Survey object. */
export function finalize(state: DirectorState, started_at: number): Survey {
  return {
    answers: state.answer_log,
    started_at,
    ended_at: Date.now(),
  };
}
