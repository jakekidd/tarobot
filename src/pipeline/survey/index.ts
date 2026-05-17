// Public surface of the survey engine module. Everything the UI / scripts /
// other pipeline code needs comes through here.

export { SurveyEngine } from './engine';
export type { EngineOpts } from './engine';

export { AnthropicAdapter } from './adapter-anthropic';
export type { LLMAdapter, ModelTier, ToolDef, InvocationSpec, AgentRunners } from './adapter';

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
  CastMember,
  Choice,
  CloseReason,
  CompilerInput,
  CompilerOutput,
  Contradiction,
  DialogueTree,
  EngineListener,
  EngineState,
  Hook,
  Hypothesis,
  InvestigatorAvailableNode,
  InvestigatorInput,
  InvestigatorOutput,
  Note,
  ObserverInput,
  ObserverOutput,
  Phase,
  PickEvent,
  ProfileSections,
  QueueItem,
  RenderedQuestion,
  SurveyProfile,
  TimingEvent,
  TreeNode,
  AnswerTuple,
} from './types';
