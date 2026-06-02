// Content-level dead-end detection.
//
// Engagement detection has largely moved to WEAVER (state.weaver_terminate
// fires when no candidate gains weight AND user goes flat). The three
// content-level detectors here are kept as a secondary safety net for
// the dead-end gate in beginIntentionStage — none currently fire because
// their data sources (coverage map + Phase 3 instrument counters) were
// retired in the interrogation pivot. Left as scaffolding for the
// eventual smoke-test rig + future signal sources.
//
// All detectors are pure. Pass them snapshots; they return booleans.

import type { CoverageMap } from './living-doc';
import type { PickEvent } from './types';

/** After N post-opener turns with no candidate Dilemma concentrating
 *  mass, declare the hunt flat. Conservative: only fires when we've
 *  given the engine real time to find something. */
export const DISTRIBUTION_FLATNESS_TURN_WINDOW = 6;
/** Required minimum max-confidence across the coverage map for the
 *  hunt to count as "concentrating." Below this after the window
 *  fires distribution-flatness. */
export const DISTRIBUTION_FLATNESS_CONFIDENCE_FLOOR = 0.35;

/** Phase 3+ instrument-driven thresholds. Stay 0 / Infinity for Phase 2
 *  (no instrument source exists yet — the streaks never fire). */
export const NONE_STREAK_THRESHOLD = 3;
export const REJECTION_WITHOUT_CORRECTION_STREAK_THRESHOLD = 3;

export type DeadEndReason =
  | 'distribution_flat'
  | 'none_streak'
  | 'rejection_without_correction_streak';

export type DeadEndCheck = {
  fired: boolean;
  reasons: DeadEndReason[];
};

/** Distribution flatness — after N post-opener turns, is the coverage
 *  map's strongest dimension still below the confidence floor? */
export function isDistributionFlat(args: {
  post_opener_turn: number;
  coverage: CoverageMap;
}): boolean {
  if (args.post_opener_turn < DISTRIBUTION_FLATNESS_TURN_WINDOW) return false;
  const dims = Object.values(args.coverage);
  if (dims.length === 0) return true; // window elapsed and zero dims = flat
  const max_confidence = dims.reduce(
    (m, d) => (d.confidence > m ? d.confidence : m),
    0,
  );
  return max_confidence < DISTRIBUTION_FLATNESS_CONFIDENCE_FLOOR;
}

/** None-streak — last K consecutive forced_choice_with_none picks all
 *  landed on None. Phase 2: always false (no source — Phase 3
 *  instruments will tag these picks). */
export function isNoneStreak(picks: readonly PickEvent[]): boolean {
  const tail = recentForcedChoiceWithNonePicks(picks, NONE_STREAK_THRESHOLD);
  if (tail.length < NONE_STREAK_THRESHOLD) return false;
  return tail.every((p) => p.answer === 'none' || (Array.isArray(p.answer) && p.answer[0] === 'none'));
}

/** Rejection-without-correction streak — last K consecutive guess
 *  picks were rejected (answer === 'false') with no correction text
 *  supplied. Phase 2: always false (no source — Phase 3 instruments
 *  will tag these picks). */
export function isRejectionWithoutCorrectionStreak(picks: readonly PickEvent[]): boolean {
  const tail = recentGuessPicks(picks, REJECTION_WITHOUT_CORRECTION_STREAK_THRESHOLD);
  if (tail.length < REJECTION_WITHOUT_CORRECTION_STREAK_THRESHOLD) return false;
  return tail.every((p) => p.answer === 'false');
}

/** Compose all detectors. Returns the first matching reason set the
 *  engine should route on. */
export function checkDeadEndSignals(args: {
  post_opener_turn: number;
  coverage: CoverageMap;
  picks: readonly PickEvent[];
}): DeadEndCheck {
  const reasons: DeadEndReason[] = [];
  if (isDistributionFlat({ post_opener_turn: args.post_opener_turn, coverage: args.coverage })) {
    reasons.push('distribution_flat');
  }
  if (isNoneStreak(args.picks)) reasons.push('none_streak');
  if (isRejectionWithoutCorrectionStreak(args.picks)) reasons.push('rejection_without_correction_streak');
  return { fired: reasons.length > 0, reasons };
}

// ─── helpers (Phase 3 will populate these against real instruments) ──

function recentForcedChoiceWithNonePicks(
  _picks: readonly PickEvent[],
  _limit: number,
): readonly PickEvent[] {
  // Phase 2: no forced_choice_with_none instrument exists yet, so the
  // tag we'd filter on isn't present on any pick. Return empty —
  // streak detector reads it as "no streak."
  return [];
}

function recentGuessPicks(
  _picks: readonly PickEvent[],
  _limit: number,
): readonly PickEvent[] {
  // Phase 2: no guess instrument exists yet. Same shape as above.
  return [];
}
