// WEAVER agent — Haiku, candidate-dilemma curator during Interrogation.
// (Renamed from PSYCH.)

export { runWeaver, formatWeaverCandidatesForPrompt } from './agent';
export { parseWeaverTextBlob } from './parseTextBlob';
export type { WeaverTextBlob, Engagement } from './parseTextBlob';
export { WEAVER_SYSTEM_TEMPLATE } from './prompt';
