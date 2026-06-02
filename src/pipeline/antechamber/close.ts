// Antechamber close criteria.
//
// Per user direction, auto-close on engagement / saturation / hard cap has
// been removed. The survey now runs indefinitely; close fires only via:
//   • user_exit       — user pressed "ready for the cards" or "exit"
//   • queue_exhausted — engine has nothing left to ask (all roots answered)
//   • cap             — only the e2e harness honours this, via --maxQuestions
//
// shouldClose() always returns { should: false } — there is no auto-close
// triggered by the engine itself. Kept as an exported function so callers
// don't break; if heat / saturation logic comes back, it lives here.

import type { CloseReason, EngineState } from './types';

export type CloseDecision =
  | { should: false }
  | { should: true; reason: CloseReason };

export function shouldClose(_state: EngineState): CloseDecision {
  return { should: false };
}
