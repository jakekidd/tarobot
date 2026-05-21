// Detective agent — public surface. Engine + tests import from here.

export { runDetective } from './agent';
export { DetectiveOutputSchema } from './schema';
export { DETECTIVE_SYSTEM, DETECTIVE_TOOL } from './prompt';
export { buildDetectivePayload } from './payload';
export {
  addNewHypotheses,
  mergeStoryUpdates,
  applyDetectiveOutput,
  type DetectiveOutput,
} from './apply';
