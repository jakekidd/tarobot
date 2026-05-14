// Phase derivation. Phase is a coarse label for the model prompts (A/B/C/D/E);
// heat is the underlying continuous variable in [0, 1]. Phase advances are
// monotonic — once Phase C is reached, heat dropping back below the C band
// doesn't return us to B. The cat doesn't un-learn the name.
//
// Phase E is closed-state, set only by the engine's close criteria
// (close.ts), independent of heat.

import type { Phase } from './types';

const PHASE_RANK: Record<Phase, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/** Heat → phase mapping. Bands are inclusive-low, exclusive-high. */
export function phaseFromHeat(heat: number): Phase {
  if (heat < 0.20) return 'A';
  if (heat < 0.45) return 'B';
  if (heat < 0.70) return 'C';
  return 'D';
}

/** Returns the later of two phases by sequence order. */
export function maxPhase(a: Phase, b: Phase): Phase {
  return PHASE_RANK[a] >= PHASE_RANK[b] ? a : b;
}

/** True if `next` is strictly later in the sequence than `prev`. */
export function isPhaseAdvance(prev: Phase, next: Phase): boolean {
  return PHASE_RANK[next] > PHASE_RANK[prev];
}

/**
 * Derive the new phase given the current phase, the current heat, and whether
 * the survey is closed. Never regresses below `currentPhase`. If `closed` is
 * true, returns 'E' regardless.
 */
export function derivePhase(currentPhase: Phase, heat: number, closed: boolean): Phase {
  if (closed) return 'E';
  const heatPhase = phaseFromHeat(heat);
  return maxPhase(currentPhase, heatPhase);
}
