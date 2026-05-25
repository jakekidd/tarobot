// Profiler agent — v3.2 hypothesis curator. Public surface.
//
// The profiler is the scribe half of the cognition split (the
// detective is the hunter). v3.2: it CURATES the hypothesis list
// instead of writing a prose anchor. The close-pass prose generation
// moves to the new compiler agent.

export { runProfiler, pickTier } from './agent';
export type { RunProfilerArgs, ProfilerTrigger } from './agent';
export {
  ProfilerOutputSchema,
  HypothesisEditSchema,
  ProbeStatusSchema,
  type ProfilerOutput,
  type HypothesisEdit,
  type ProbeStatusV,
} from './schema';
export { PROFILER_SYSTEM, PROFILER_TOOL } from './prompt';
export { buildProfilerPayload, type ProfilerPayloadArgs } from './payload';
export { applyHypothesisEdits } from './apply';
