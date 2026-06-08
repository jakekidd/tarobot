// Public surface of the TuningEngine — stage 2, the post-survey engine that
// paints the Portrait (Condenser) and hosts the dilemma-hunting Agents. The
// Condenser is the one piece still unwired; the Conjector it feeds is built.

export { TuningEngine } from './TuningEngine';
export { ConjectorAgent } from './ConjectorAgent';
export type { Agent, AgentContext } from './Agent';
export type { Portrait, Dilemma, ConjectorResult, ConjectureRecord } from './types';
