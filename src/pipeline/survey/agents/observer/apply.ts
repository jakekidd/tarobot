// Observer apply — Phase 2 stub.
//
// Phase 3 replaces this with `applyObserverDelta(state, delta)` that
// folds the observer's scaffold-delta into doc.scaffold + appends to
// doc.margin (capped at MARGIN_CAP, oldest-evict) and bumps doc.v.
//
// In Phase 2 the agent throws `not_implemented_v2` before producing
// output, so this function is never called at runtime. The signature
// is preserved so engine.ts imports still resolve. Tests are .skip'd.

import type { SurveyProfile, ObserverOutput } from '../../types';

export type { ObserverOutput };

/** Stub for the legacy observer apply path. Phase 3 replaces with
 *  applyObserverDelta. */
export function applyObserverOutput(_profile: SurveyProfile, _out: ObserverOutput): SurveyProfile {
  throw new Error('not_implemented_v2: applyObserverOutput replaced by applyObserverDelta in Phase 3');
}

// REQUIRED_PROFILE_SECTIONS / splitBodyIntoSections / mergeBodySections
// removed — they served the deleted profile.body markdown doc.
