// Detective agent — public surface. Engine + tests import from here.

export { runDetective } from './agent';
export {
  DetectiveOutputSchema,
  StoryUpdatesSchema,
  MoveSchema,
  type DetectiveOutput,
  type StoryUpdates,
} from './schema';
// Move type is canonical in living-doc.ts — not re-exported here to
// avoid duplicate-identifier collisions in the survey/index barrel.
export { DETECTIVE_SYSTEM, DETECTIVE_TOOL } from './prompt';
export { buildDetectivePayload } from './payload';
export {
  applyDetectiveOutput,
  mergeStoryUpdates,
  type DetectiveApplyResult,
} from './apply';
