// Public surface of the survey engine module. Everything the UI / scripts /
// other pipeline code needs comes through here.

export { SurveyEngine } from './engine';
export type { EngineOpts } from './engine';

// Adapter moved to ../llm. These re-exports stay so older imports
// (survey was the original adapter home) keep working — newer code
// should import from '../llm' directly.
export { AnthropicAdapter } from '../llm';
export type { LLMAdapter, ModelTier, ToolDef, InvocationSpec } from '../llm';

export { findReturningUser, seedFromReturning } from './returning';
export type { ReturningMatch } from './returning';

export {
  TREE,
  validateTree,
  renderQuestion,
  getNode,
  getOpeners,
  getPoolNodeIds,
  getTopics,
  getNodesByTopic,
  setActiveTree,
  isUsingTreeOverride,
  getBundledTree,
  subscribeToOverrideChanges,
} from './tree';

export { shouldClose } from './close';
export { derivePhase, phaseFromTurns } from './phase';

export type {
  AnswerFormat,
  ActiveThread,
  BasketItem,
  CastMember,
  Choice,
  CloseReason,
  Contradiction,
  DetectiveOutput,
  DialogueTree,
  EngineListener,
  EngineState,
  Hook,
  Hypothesis,
  InterrogatorOutput,
  Investigation,
  Note,
  ObserverOutput,
  Phase,
  PickEvent,
  PipelineContext,
  ProfileSections,
  QueueItem,
  RenderedQuestion,
  SurveyProfile,
  TimingEvent,
  TreeNode,
  AnswerTuple,
} from './types';
