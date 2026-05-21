// Shared helpers across the survey-pipeline agents (observer +
// detective). Phase 3 hollowed this out further — the LadderRungSchema
// and applyLadderMoves/removeFromLadder stubs are gone with the
// legacy hypothesis ladder. compactProfile is the only survivor;
// per-agent payload builders still call it to surface identity + cast
// the same way.

import type { PipelineContext } from '../types';

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
