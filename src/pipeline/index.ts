// Public API of the cognition pipeline library.
// Anything outside `src/pipeline/` should import only from this file.
//
// Portability rule: this module must run unchanged in Node. No React,
// no DOM. The eventual production system will import this directory
// verbatim and swap the LLMAdapter to a local LLM client.

export type {
  // Survey (legacy shape — populated by the new survey engine's Compiler pass
  // and consumed by the tent. The new engine has its own types under ./survey.)
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
  // Cards / Spreads / Reading
  Arcana, Suit, Card,
  Spread, SpreadPosition, SpreadPositionLayout, DrawnCard, DrawnCards,
  Chapter, Reading,
} from './types';

// Astrology
export {
  computeSunSign,
  computeAstroProfile,
  parseBirthDate,
  summarizeAstro,
  lifePathFor,
  tarotBirthCardFor,
  sunSignFor,
} from './astrology';
export type {
  SunSign,
  BirthDate,
  TarotBirthCard,
  AstroProfile,
} from './astrology';

// Cards & spreads
export { ALL_CARDS, drawCards, drawForSpread, getCard, findByName } from './cards';
export { ALL_SPREADS, FOUR_CARD_DIAMOND, getSpread } from './spreads';

// Personas
export { PERSONAS, DEFAULT_PERSONA, getPersona } from './personas';
export type { Persona, PersonaId } from './personas';

// Claude client
export { createClaudeClient, validateKey, MODELS } from './claude';
export type { ClaudeClient } from './claude';
