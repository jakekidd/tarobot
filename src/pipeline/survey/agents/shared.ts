// Shared helpers across the survey-pipeline agents (observer +
// detective).
//
// Phase 2 status: this file is hollowed out. The ladder operations
// (applyLadderMoves, removeFromLadder, compactInvestigation) are
// gone — the 6-rung HypothesisLadder type they served has been
// deleted. The legacy ObserverOutputSchema / DetectiveOutputSchema
// still reference LadderRungSchema (a zod enum), so we keep that
// here. Both schemas + this file disappear in Phase 3 when the new
// LivingDoc-shaped output schemas land.
//
// compactProfile remains (slimmed) since the stubbed agent payloads
// still build it for the model context.

import { z } from 'zod';
import type { PipelineContext } from '../types';

// ─── Zod atoms ─────────────────────────────────────────

/** Ladder rung names. Backs the legacy ObserverOutputSchema and
 *  DetectiveOutputSchema. Phase 3 deletes both schemas + this enum. */
export const LadderRungSchema = z.enum([
  'confirmed', 'probable', 'tentative', 'contested', 'refuted', 'held',
]);

// ─── Payload compactors ────────────────────────────────

/** Compact a SurveyProfile for the user-message payload. Slim in v2:
 *  identity + cast only. The psychological content lives in
 *  LivingDoc and is delivered separately. */
export function compactProfile(p: PipelineContext['profile']) {
  return {
    identity: {
      name: p.name || undefined,
      sun_sign: p.sun_sign,
      life_path: p.life_path,
      birth_card: p.birth_card,
      age_bracket: p.age_bracket,
      birth_time_bracket: p.birth_time_bracket,
      initial_intention: p.initial_intention,
    },
    cast: p.cast,
  };
}

// applyLadderMoves / removeFromLadder / compactInvestigation removed
// with the Investigation type. Tests that exercised them are skipped
// in Phase 2 and rewritten in Phase 3 around the new LivingDoc apply
// functions. The `__test_*` re-exports in engine.ts are stubbed.

// ─── Phase 2 stubs (for engine.ts __test_* re-exports) ────

/** Stubs that satisfy the test re-export shape but throw if actually
 *  invoked. Tests that called these are .skip'd in Phase 2. */
export function applyLadderMoves(): never {
  throw new Error('not_implemented_v2: ladder ops are deleted; tests should be .skip\'d');
}
export function removeFromLadder(): never {
  throw new Error('not_implemented_v2: ladder ops are deleted; tests should be .skip\'d');
}
