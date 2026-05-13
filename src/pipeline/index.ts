// Public API of the cognition pipeline library.
// Anything outside `src/pipeline/` should import only from this file.
//
// Portability rule: this module must run unchanged in Node. No React,
// no DOM. The eventual production system will import this directory
// verbatim and swap in a different ClaudeClient + add a LocalLLMClient
// for the persona layer.

export type {
  // Survey
  Survey, SurveyAnswer, SurveyQuestion, SurveyQuestionFormat,
  // Choice (unified)
  Choice, ChoiceSource,
  // Profile blobs
  CastEntry, Thread, Hunch, Highlight, ClatNote,
  // Profile (the growing blob)
  Profile,
  // Question (cognition→persona unit)
  Question,
  // Transcript
  Speaker, TranscriptLine,
  // Engine
  EngineState, PersonaAnimation,
  // Cards / Spreads / Reading (unused in MVP but kept for tarot phase)
  Arcana, Suit, Card,
  Spread, SpreadPosition, SpreadPositionLayout, DrawnCard, DrawnCards,
  Chapter, Reading,
} from './types';

export { computeSunSign } from './astrology';
export type { SunSign } from './astrology';

// Cards & spreads (data + utilities for tarot phase)
export { ALL_CARDS, drawCards, drawForSpread, getCard, findByName } from './cards';
export { ALL_SPREADS, FOUR_CARD_DIAMOND, getSpread } from './spreads';

// Personas (the 3-voice registry, used by the tarot reading phase later)
export { PERSONAS, DEFAULT_PERSONA, getPersona } from './personas';
export type { Persona, PersonaId } from './personas';

// Claude client
export { createClaudeClient, validateKey, MODELS } from './claude';
export type { ClaudeClient } from './claude';

// Clat (survey)
export { QUESTION_POOL, findQuestion } from './clat/pool';
export {
  newDirector,
  applyAnswer,
  inject,
  consumeInjected,
  nextQuestion,
  finalize as finalizeSurvey,
  answeredCount,
  canEnd,
  mustEnd,
  pushComment,
  popComment,
  appendClatNotes,
  markClatSawN,
  SURVEY_END_OFFER_AT,
  SURVEY_HARD_CAP,
  COMMENT_QUEUE_CAP,
  CLAT_HOLD_FOR_FIRST_N_ANSWERS,
} from './clat/director';
export type { DirectorState } from './clat/director';
export { clatReact } from './clat/agent';
export type { ClatOutput } from './clat/prompts/clat';

// Compiler — accepts survey + accumulated clat notes
export { compile, pickOpener } from './compiler/compile';
export type { CompilerOutput } from './compiler/prompts/compiler';

// Engine
export {
  newEngineState,
  appendTranscript,
  appendHindsight,
  applyProfileDeltas,
  applyHighlightsUpdate,
  enqueueQuestion,
  dequeueQuestion,
  setAnimation,
  bumpTurn,
  DEFAULT_HIGHLIGHT_TTL,
  HIGHLIGHTS_SOFT_CAP,
  QUEUE_REFILL_THRESHOLD,
  QUEUE_MAX_DEPTH,
} from './engine/state';
export type { ProfileDeltas, HighlightsUpdate } from './engine/state';
export { cognitionTick, applyCognitionOutput } from './engine/cognition';
export type { CognitionOutput } from './engine/prompts/cognition';
export { personaSpeak } from './engine/persona';
export type { PersonaTurnOutput } from './engine/prompts/persona';
export { bootEngine, userPick } from './engine/orchestrator';
