// Survey close criteria. Three independent predicates evaluated each turn,
// OR'd together. The one that fires sets close_reason for downstream
// telemetry / the eventual reading.
//
//   1. Saturation (primary)   — we have what we need; survey is done.
//   2. Fatigue   (secondary)  — user is checking out; wrap up with what we have.
//   3. Hard cap  (tertiary)   — never exceed N questions regardless.
//
// `user_exit` is set separately by the engine when the participant chooses to
// skip ahead via the UI.

import type { EngineState, CloseReason } from './types';
import { heatBelowFor } from './heat';

export const SURVEY_HARD_CAP = 20;
export const FATIGUE_THRESHOLD_HEAT = 0.3;
export const FATIGUE_WINDOW = 3;
export const FATIGUE_MIN_QUESTIONS = 8;

export type CloseDecision =
  | { should: false }
  | { should: true; reason: CloseReason };

/**
 * Decide whether to close the survey. Saturation is the goal; fatigue is the
 * graceful fallback; cap is the safety net.
 */
export function shouldClose(state: EngineState): CloseDecision {
  if (saturationReached(state)) return { should: true, reason: 'saturation' };
  if (fatigueReached(state))    return { should: true, reason: 'fatigue' };
  if (capReached(state))        return { should: true, reason: 'cap' };
  return { should: false };
}

/**
 * Saturation: we have a meaningful Choice, at least one cast member, at least
 * one hook, and notes spanning four of the six profile sections.
 */
export function saturationReached(state: EngineState): boolean {
  const c = state.choice_draft;
  if (!c) return false;
  if (c.confidence === 'low') return false;

  const cast = state.profile.cast;
  if (cast.length === 0) return false;

  if (state.profile.hooks.length === 0) return false;

  const sections = state.profile.sections;
  const filledSections =
    (sections.identity.length > 0 ? 1 : 0) +
    (sections.state.length > 0 ? 1 : 0) +
    (sections.relational.length > 0 ? 1 : 0) +
    (sections.self_model.length > 0 ? 1 : 0) +
    (sections.decision_context.length > 0 ? 1 : 0) +
    (sections.patterns.length > 0 ? 1 : 0);
  if (filledSections < 4) return false;

  return true;
}

/**
 * Fatigue: heat has been below threshold for the last N picks, AND we have at
 * least a low-confidence Choice, AND we've answered enough questions to justify
 * wrapping rather than just starting.
 */
export function fatigueReached(state: EngineState): boolean {
  if (state.picks_log.length < FATIGUE_MIN_QUESTIONS) return false;
  if (!state.choice_draft) return false;
  return heatBelowFor(state.heat_history, FATIGUE_THRESHOLD_HEAT, FATIGUE_WINDOW);
}

/** Hard cap on question count. */
export function capReached(state: EngineState): boolean {
  return state.picks_log.length >= SURVEY_HARD_CAP;
}
