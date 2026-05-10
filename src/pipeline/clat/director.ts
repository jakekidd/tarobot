import type { Survey, SurveyAnswer, SurveyQuestion } from '../types';
import { QUESTION_POOL } from './pool';

// Pure logic. No LLM. Picks questions from the pool with category coverage,
// drains the Clat-agent injection queue when it has entries.

export type DirectorState = {
  pool: SurveyQuestion[];
  answered_ids: Set<string>;
  injected_queue: SurveyQuestion[];   // Clat-agent inserts here
  answer_log: SurveyAnswer[];
  category_counts: Record<string, number>;
  identity_questions_required: string[];   // must always ask these (name, birthday)
};

export function newDirector(): DirectorState {
  return {
    pool: QUESTION_POOL,
    answered_ids: new Set(),
    injected_queue: [],
    answer_log: [],
    category_counts: {},
    identity_questions_required: ['name-input', 'who-came-with', 'birthday'],
  };
}

/** The two limits the user agreed to: 20 = END button appears, 50 = hard cap. */
export const SURVEY_END_OFFER_AT = 20;
export const SURVEY_HARD_CAP = 50;

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

/** Inject a Clat-agent-generated question to the front of the queue. */
export function inject(state: DirectorState, q: SurveyQuestion): DirectorState {
  return { ...state, injected_queue: [...state.injected_queue, q] };
}

/**
 * Pick the next question. Identity questions go first (name, who-with, birthday).
 * Then drain the injected queue. Then RNG-pick from the pool, weighted to
 * favor categories with the lowest current count (gentle coverage push).
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

  // Drain injected queue (Clat agent's contributions)
  if (state.injected_queue.length > 0) {
    return state.injected_queue[0]!;
  }

  // RNG from pool, biased away from already-answered + saturated categories
  const candidates = state.pool.filter((q) => !state.answered_ids.has(q.id));
  if (candidates.length === 0) return null;

  // Weight: 1 / (1 + category_count). Less-asked categories are heavier.
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

/** Drain the injected queue head — only call after that question is delivered. */
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
