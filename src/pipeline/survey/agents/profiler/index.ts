// Profiler agent — public surface. Engine imports from here.
//
// The profiler is the scribe half of the v3 cognition split (the
// detective is the hunter). Triggered on resolution events, not every
// turn. Owns the markdown Subject Anchor; never speaks to the user.

export { runProfiler, pickTier } from './agent';
export type { RunProfilerArgs } from './agent';
export { ProfilerOutputSchema, type ProfilerOutput } from './schema';
export { PROFILER_SYSTEM, PROFILER_TOOL } from './prompt';
export { buildProfilerPayload, type ProfilerPayloadArgs, type ProfilerTrigger } from './payload';
