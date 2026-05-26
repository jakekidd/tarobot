// Public surface of the survey engine module. Everything the UI / scripts /
// other pipeline code needs comes through here.

export { SurveyEngine, STARTER_SEED_COUNT } from './engine';
export type { EngineOpts } from './engine';

// Adapter moved to ../llm. These re-exports stay so older imports
// (survey was the original adapter home) keep working — newer code
// should import from '../llm' directly.
export { AnthropicAdapter } from '../llm';
export type { LLMAdapter, ModelTier, ToolDef, InvocationSpec } from '../llm';

export { findPeopleMatchingName } from './returning';
export type { ReturningMatch } from './returning';

export {
  TREE,
  validateTree,
  renderQuestion,
  renderQueueItem,
  getNode,
  getOpeners,
  getPillars,
  getPoolNodeIds,
  getTopics,
  getNodesByTopic,
  setActiveTree,
  isUsingTreeOverride,
  getBundledTree,
  subscribeToOverrideChanges,
} from './tree';

export { RETURN_LINES, pickReturnLine } from './return-lines';

export { appendVerbatim, formatVerbatimEntry, formatVerbatimLog } from './verbatim-log';

export { parseAssertionAnswer, encodeAssertionAnswer } from './instruments';
export type { Instrument, AssertionInstrument, AssertionResult } from './instruments';

export {
  checkDeadEndSignals,
  isDistributionFlat,
  isNoneStreak,
  isRejectionWithoutCorrectionStreak,
  DISTRIBUTION_FLATNESS_TURN_WINDOW,
  DISTRIBUTION_FLATNESS_CONFIDENCE_FLOOR,
  NONE_STREAK_THRESHOLD,
  REJECTION_WITHOUT_CORRECTION_STREAK_THRESHOLD,
} from './signals';
export type { DeadEndCheck, DeadEndReason } from './signals';

export { parseAnchorSections, diffAnchors, isAnchorComplete } from './anchor';
export type { ParsedSection, AnchorDiff } from './anchor';
export {
  ANCHOR_SECTIONS,
  ANCHOR_TEMPLATE_MD,
  formatAnchorSectionsForPrompt,
  anchorSectionHeadings,
} from './anchor-template';
export type { AnchorSection } from './anchor-template';

export { shouldClose } from './close';
export { derivePhase, phaseFromTurns } from './phase';

export type {
  AnswerFormat,
  AnswerTuple,
  CastMember,
  CloseReason,
  DialogueTree,
  EngineListener,
  EngineState,
  Hypothesis,
  Phase,
  PickEvent,
  PipelineContext,
  ProbeBlock,
  QueueItem,
  RenderedQuestion,
  SideChannel,
  StoryObject,
  SurveyProfile,
  SurveyStage,
  TimingEvent,
  TreeNode,
  VerbatimEntry,
} from './types';

// Detective — text-blob output, no tool call.
export { runDetective, blobToQueuedAssertion } from './agents/detective';
export type { DetectiveTextBlob } from './agents/detective';

export type { ProbeStatus } from './living-doc';

// Transcript types.
export { renderTranscript, pickToTranscriptEntry } from './transcript';
export type { TranscriptEntry } from './transcript';
export type { QueuedAssertion } from './types';

// v2 LivingDoc types — new public surface introduced in Phase 2.
export type {
  LivingDoc,
  Probe,
  CoverageDim,
  CoverageMap,
  DocScaffold,
  TemporalLean,
  Move,
  QueueZone,
} from './living-doc';
export { EMPTY_DOC, MARGIN_CAP, TELLS_CAP } from './living-doc';
