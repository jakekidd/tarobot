// Public API of the cognition pipeline library.
// Anything outside `src/pipeline/` should import only from this file.
//
// Portability rule: this module must run unchanged in Node. No React,
// no DOM. The eventual production system will import this directory
// verbatim and swap in a different ClaudeClient + add a LocalLLMClient
// for the persona layer.

export type {
  // Survey
  Survey, ComingWith, RegisterPick, Familiar, WantFromReading,
  // Profile
  Disclosure, DisclosureDomain, Tense, DisclosureSource,
  ChoiceCandidate, ChoiceSource,
  TargetChoice, TimeHorizon,
  ProfilePatterns, SkepticismPosture, Hook,
  EnrichedProfile, BaseProfile,
  // Cards
  Card, Arcana, Suit,
  // Spreads
  Spread, SpreadPosition, SpreadPositionLayout,
  DrawnCard, DrawnCards,
  // Reading
  Chapter, Reading,
  // Interview
  InterviewMessage, InterviewDecision, InterviewState,
} from './types';

export { ALL_CARDS, drawCards, drawForSpread, getCard, findByName } from './cards';
export { ALL_SPREADS, FOUR_CARD_DIAMOND, getSpread } from './spreads';
export { createClaudeClient, validateKey, MODELS } from './claude';
export type { ClaudeClient } from './claude';

export { startInterview, openInterview, interviewTurn, finalizeProfile } from './interview';
export { constructReading } from './reading';
export { translateChapter } from './persona';
export { PERSONAS, DEFAULT_PERSONA, getPersona, type Persona, type PersonaId } from './personas';
