// Observer agent — public surface. Engine + tests import from here.

export { runObserver, runFinalObserver } from './agent';
export { ObserverOutputSchema } from './schema';
export { OBSERVER_SYSTEM, OBSERVER_TOOL } from './prompt';
export { buildObserverPayload, type ObserverPayloadMode } from './payload';
export {
  applyObserverOutput,
  type ObserverOutput,
} from './apply';
// REQUIRED_PROFILE_SECTIONS / splitBodyIntoSections / mergeBodySections
// removed in Phase 2 — they served profile.body, which is gone.
