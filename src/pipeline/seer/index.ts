// Public surface of the seer module.
//
// The Seer is an engine (same architectural tier as SurveyEngine) that
// hosts internal director + actor layers and orchestrates four
// behavior tranches:
//
//   intro       — serial director → actor (kicked off at construction)
//   per-card    — serial director → actor, speculative fan-out
//   chat        — actor-only today (director-side chat lives in TODO)
//   outro       — serial director → actor (after the last flip)

export { Seer } from './seer';
export type { SeerOpts } from './seer';

export {
  ACTORS,
  DEFAULT_ACTOR_ID,
  getActor,
  SHARED_CRAFT,
} from './actors';
export type { Actor, ActorId } from './actors';

export {
  directorIntro,
  directorPerCard,
  directorClosing,
} from './agents/director';
export {
  actorPerCard,
  actorIntro,
  actorClosing,
  actorChat,
} from './agents/actor';

export type {
  ChatMessage,
  ChatSpeaker,
  Set,
  ClinicalIntent,         // deprecated alias of Set
  ClosingIntent,
  IntroDirectorInput,
  Monologue,
  Outcome,
  NarrativeRole,
  ReadingInputs,
  ReadingListener,
  ReadingPhase,
  ReadingState,
  RevealedSlot,
} from './types';

export { buildMarisolDemoSeer, MARISOL_INTRO } from './fixtures';
export { pickStall } from './stalls';
export type { StallLayer } from './stalls';
export { FILLERS, pickFiller, FILLER_MIN_MS, FILLER_MAX_MS } from './fillers';
