// Phase derivation. Phase is a coarse label that drives the Investigator's
// preamble register (silence in A, dry in B, name-using in C, specific in D).
//
// Phase used to derive from a heat number that the engine tracked from
// behavioural signals. Per user direction (mid-iteration), the heat /
// fatigue / hard-cap auto-close functionality has been removed; the antechamber
// now runs indefinitely (closes only via user_exit, queue_exhausted, or
// the e2e --maxQuestions cap). Phase therefore now derives from turn count.
//
// Heat is still tracked in EngineState (for telemetry + a possible future
// return). It's just not consumed by phase or close logic.

import type { Phase } from './types';

const PHASE_RANK: Record<Phase, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

// Turn-count → phase mapping. picks_log.length is the count of answered
// questions. Tuned so the cat warms up over ~4-12 questions:
//   A: openers + 1 warmup (0..4)        — silence
//   B: light probes (5..8)              — dry, no name
//   C: deepening (9..13)                — name allowed, callbacks
//   D: specific (14+)                   — full cat voice, anchors unlocked
//
// E is closed-state, set externally by the engine.
export function phaseFromTurns(turnCount: number): Phase {
  if (turnCount <= 4) return 'A';
  if (turnCount <= 8) return 'B';
  if (turnCount <= 13) return 'C';
  return 'D';
}

export function maxPhase(a: Phase, b: Phase): Phase {
  return PHASE_RANK[a] >= PHASE_RANK[b] ? a : b;
}

export function isPhaseAdvance(prev: Phase, next: Phase): boolean {
  return PHASE_RANK[next] > PHASE_RANK[prev];
}

/**
 * Derive the new phase given the current phase, the turn count, and whether
 * the antechamber is closed. Never regresses below `currentPhase`. If `closed` is
 * true, returns 'E' regardless.
 */
export function derivePhase(currentPhase: Phase, turnCount: number, closed: boolean): Phase {
  if (closed) return 'E';
  return maxPhase(currentPhase, phaseFromTurns(turnCount));
}
