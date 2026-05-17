// Public surface of the reading engine module.

export { ReadingEngine } from './reading';
export type { ReadingOpts } from './reading';

export {
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
  ClinicalIntent,
  ClosingIntent,
  Monologue,
  NarrativeRole,
  ReadingInputs,
  ReadingListener,
  ReadingPhase,
  ReadingState,
  RevealedSlot,
} from './types';
export { readingInputsFromCompiler } from './types';

export { buildMarisolDemoBrief, MARISOL_INTRO } from './fixtures';
export { pickStall } from './stalls';
export type { StallTier } from './stalls';
export { FILLERS, pickFiller, FILLER_MIN_MS, FILLER_MAX_MS } from './fillers';
