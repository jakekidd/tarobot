// Detective apply — Phase 2 stub.
//
// Phase 3 replaces this with `applyDetectiveMove(state, move)` that
// interprets the detective's Move (append | revise | conclude) and
// returns the next engine state. story_updates fold into doc.story;
// leading_hypothesis updates doc.scaffold.leading_hypothesis.
//
// In Phase 2 the agent throws `not_implemented_v2` before producing
// output, so this function is never called at runtime.

import type { DetectiveOutput } from '../../types';

export type { DetectiveOutput };

/** Stub for the legacy detective apply path. Phase 3 replaces. */
export function applyDetectiveOutput(_inv: unknown, _out: DetectiveOutput): never {
  throw new Error('not_implemented_v2: applyDetectiveOutput replaced by applyDetectiveMove in Phase 3');
}

/** Stub — was used to surface new hypotheses onto the ladder. */
export function addNewHypotheses(): never {
  throw new Error('not_implemented_v2: hypothesis ladder is deleted; detective owns leading_hypothesis + held probes in v2');
}

/** Stub — was used to merge story_updates. */
export function mergeStoryUpdates(): never {
  throw new Error('not_implemented_v2: story updates fold via applyDetectiveMove in Phase 3');
}
