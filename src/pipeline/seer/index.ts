// Public surface of the seer module.
//
// The Seer is an engine (same architectural tier as SurveyEngine) that
// hosts internal cognition + persona agents and orchestrates four
// behavior tranches:
//
//   intro       — serial cognition → persona (kicked off at construction)
//   per-card    — serial cognition → persona, speculative fan-out
//   chat        — parallel cognition || persona (chat lives in persona today)
//   outro       — serial cognition → persona (after the last flip)

export { Seer } from './seer';
export type { SeerOpts } from './seer';

export {
  cognitionIntro,
  cognitionPerCard,
  cognitionClosing,
} from './cognition';
export {
  personaPerCard,
  personaIntro,
  personaClosing,
  personaChat,
} from './persona';

export type {
  ChatMessage,
  ChatSpeaker,
  Set,
  ClinicalIntent,         // deprecated alias of Set
  ClosingIntent,
  IntroCognitionInput,
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
export type { StallTier } from './stalls';
export { FILLERS, pickFiller, FILLER_MIN_MS, FILLER_MAX_MS } from './fillers';
