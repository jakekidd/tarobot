// Public surface of the TuningEngine — stage 2, the post-survey engine that
// paints the Portrait (Condenser) and hosts the dilemma-hunting Agents
// (ConjectorAgent is activity #1). assemble() bundles the antechamber's
// handoff artifact (AntechamberOutput) once the hunt is done.

export { TuningEngine } from './TuningEngine';
export { ConjectorAgent } from './ConjectorAgent';
export { draftPortrait } from './portraitDraft';
export { enrichWriteIn, type WriteInEnrichment } from './writeInEnricher';
export type { Agent, AgentContext } from './Agent';
export type {
  AntechamberOutput,
  ConjectorEnd,
  ConjectorResult,
  ConjectureRecord,
  Dilemma,
  Portrait,
} from './types';
