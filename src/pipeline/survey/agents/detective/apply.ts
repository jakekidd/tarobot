// Detective apply — fold a DetectiveOutput into engine state.
//
// Phase 3 mutations:
//   - leading_hypothesis: REPLACE doc.scaffold.leading_hypothesis
//   - story_updates: partial merge into doc.story
//   - next_move:
//       - append: capture as advisory (engine doesn't yet rewrite
//         queue.tail in Phase 3 — Phase 4 wires queue zones)
//       - revise: ignored in Phase 3
//       - conclude: signaled to engine for stage transition (engine
//         still gates on pillar floor)
//
// Bumps doc.v when the mutation actually changes doc state.

import type { LivingDoc } from '../../living-doc';
import type { StoryObject } from '../../types';
import type { DetectiveOutput, StoryUpdates, Move } from './schema';

/** Result of applying a detective output. Engine reads:
 *    - nextDoc → setState({doc: nextDoc})
 *    - move → if kind='conclude', engine calls beginIntentionStage
 *      (gated on pillar floor). Phase 4: append/revise rewire queue.tail. */
export type DetectiveApplyResult = {
  nextDoc: LivingDoc;
  move: Move;
};

export function applyDetectiveOutput(doc: LivingDoc, out: DetectiveOutput): DetectiveApplyResult {
  const hasLeadingUpdate = out.leading_hypothesis !== doc.scaffold.leading_hypothesis;
  const hasStoryUpdate =
    out.story_updates.fork !== undefined ||
    out.story_updates.present_pressure !== undefined ||
    out.story_updates.past_root !== undefined ||
    out.story_updates.stakes !== undefined ||
    (out.story_updates.hooks !== undefined && out.story_updates.hooks.length > 0);

  if (!hasLeadingUpdate && !hasStoryUpdate) {
    // Pure-read turn (detective only thought; didn't mutate doc).
    return { nextDoc: doc, move: out.next_move };
  }

  const nextStory = mergeStoryUpdates(doc.story, out.story_updates);
  const nextDoc: LivingDoc = {
    ...doc,
    v: doc.v + 1,
    scaffold: {
      ...doc.scaffold,
      leading_hypothesis: out.leading_hypothesis,
      // fork mirrors story.fork so the scaffold has fast access.
      fork: nextStory.fork,
    },
    story: nextStory,
  };
  return { nextDoc, move: out.next_move };
}

/** Merge a partial StoryUpdates into a full StoryObject.
 *  - fork / present_pressure / past_root / stakes: REPLACE if present
 *  - hooks: APPEND + dedupe */
export function mergeStoryUpdates(story: StoryObject, updates: StoryUpdates): StoryObject {
  const nextHooks = updates.hooks
    ? Array.from(new Set([...story.hooks, ...updates.hooks]))
    : story.hooks;
  return {
    fork: updates.fork ?? story.fork,
    present_pressure: updates.present_pressure ?? story.present_pressure,
    past_root: updates.past_root ?? story.past_root,
    stakes: updates.stakes ?? story.stakes,
    hooks: nextHooks,
  };
}
