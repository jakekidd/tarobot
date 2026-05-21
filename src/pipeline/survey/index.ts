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
  TimingEvent,
  TreeNode,
} from './types';

// v2 agent output types (live in per-agent schema.ts via z.infer).
export type { ObserverOutput, ObserverDelta } from './agents/observer';
export type { DetectiveOutput, StoryUpdates } from './agents/detective';

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
