// Heat — the continuous engagement variable in [0, 1] that drives phase
// progression. The ENGINE owns heat, not any LLM. The Observer can advise
// via signal flags but the engine computes the actual number from
// behavioural signals (latency, pass, multi-select breadth, revisions)
// plus optional Observer hints (engagement signal, contradictions found,
// threads confirmed).
//
// Heat never regresses past phase boundaries — see phase.ts.

import type { BehavioralSignals } from './types';

export const STARTING_HEAT_NEW = 0.0;
export const STARTING_HEAT_RETURNING = 0.45;

// Deltas — kept conservative. Tuned against bot runs later.
const D = {
  PASS_ON_DARK: 0.03,
  ENGAGED_DARK_ANSWER: 0.06,
  LATENCY_OUTLIER_LONG: 0.02,    // > 2× rolling median (engaged hesitation)
  LATENCY_OUTLIER_SHORT: -0.02,  // < 0.3× rolling median (reflexive)
  MULTI_SELECT_BREADTH_HIGH: 0.03,  // ≥ 3 boxes checked
  MULTI_SELECT_EMPTY: -0.03,        // 0 boxes — explicit avoidance
  REVISION_BONUS: 0.01,             // per revision, cap at 3
  REVISION_CAP: 3,
  ENGAGEMENT_HIGH: 0.06,
  ENGAGEMENT_LOW: -0.04,
  CONTRADICTION_NEW: 0.05,
  THREAD_CONFIRMED: 0.08,
} as const;

export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Apply behavioural signal deltas to heat. Called by the engine after every
 * pick is recorded. Returns the new heat value clamped to [0, 1].
 */
export function updateHeatFromBehavior(
  prevHeat: number,
  signals: BehavioralSignals,
): number {
  let delta = 0;

  if (signals.is_dark_question) {
    delta += signals.is_pass ? D.PASS_ON_DARK : D.ENGAGED_DARK_ANSWER;
  }

  if (signals.rolling_median_ms > 0) {
    const ratio = signals.latency_ms / signals.rolling_median_ms;
    if (ratio > 2) delta += D.LATENCY_OUTLIER_LONG;
    else if (ratio < 0.3) delta += D.LATENCY_OUTLIER_SHORT;
  }

  if (signals.is_multi_select) {
    const count = signals.multi_select_count ?? 0;
    if (count >= 3) delta += D.MULTI_SELECT_BREADTH_HIGH;
    else if (count === 0) delta += D.MULTI_SELECT_EMPTY;
  }

  if (signals.revisions > 0) {
    delta += Math.min(signals.revisions, D.REVISION_CAP) * D.REVISION_BONUS;
  }

  return clamp(prevHeat + delta);
}

/**
 * Apply Observer-advised heat deltas after the agent fires. Engagement signal
 * is a coarse high/normal/low; the engine multiplies it through. Contradictions
 * and confirmed threads each contribute their own delta.
 */
export function updateHeatFromObserver(
  prevHeat: number,
  engagement: 'high' | 'normal' | 'low',
  newContradictions: number,
  newConfirmedThreads: number,
): number {
  let delta = 0;
  if (engagement === 'high') delta += D.ENGAGEMENT_HIGH;
  if (engagement === 'low') delta += D.ENGAGEMENT_LOW;
  delta += newContradictions * D.CONTRADICTION_NEW;
  delta += newConfirmedThreads * D.THREAD_CONFIRMED;
  return clamp(prevHeat + delta);
}

/**
 * Rolling median of recent answer latencies. Window of 5 by default. Used to
 * detect latency outliers without one slow answer skewing the baseline.
 */
export function rollingMedian(values: number[], window = 5): number {
  if (values.length === 0) return 0;
  const recent = values.slice(-window).slice().sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  if (recent.length % 2 === 0) {
    return (recent[mid - 1]! + recent[mid]!) / 2;
  }
  return recent[mid]!;
}

/** Heat-band predicate: has heat been below threshold for the last `n` picks? */
export function heatBelowFor(heatHistory: number[], threshold: number, n: number): boolean {
  if (heatHistory.length < n) return false;
  return heatHistory.slice(-n).every((h) => h < threshold);
}
