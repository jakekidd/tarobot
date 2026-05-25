// Profiler agent — v3.2 hypothesis curator. Runs on heartbeat
// (every 3 post-opener turns) + on correction events. The close pass
// belongs to the compiler now (separate agent, separate prompt).
//
// Tier ladder by depth:
//   turns 0–9   (during pillars / SEED)  → fast (Haiku)
//   turns 10+   (after pillars done)     → cognition (Sonnet)
//
// No more Opus tier for the profiler — Opus + extended thinking moves
// to the compiler where the prose anchor is actually written.
//
// Non-blocking. Detective stays the per-turn latency-critical path.

import type { LLMAdapter, ModelTier } from '../../../llm/adapter';
import { PROFILER_SYSTEM, PROFILER_TOOL } from './prompt';
import { ProfilerOutputSchema, type ProfilerOutput } from './schema';
import { buildProfilerPayload, type ProfilerPayloadArgs, type ProfilerTrigger } from './payload';

export type RunProfilerArgs = ProfilerPayloadArgs & {
  /** Post-opener turn count at the moment of the call. Drives the
   *  tier ladder. */
  post_opener_turn: number;
};

export async function runProfiler(
  adapter: LLMAdapter,
  args: RunProfilerArgs,
): Promise<ProfilerOutput> {
  const tier = pickTier(args.post_opener_turn);
  return adapter.invoke(
    {
      system: PROFILER_SYSTEM,
      user: JSON.stringify(buildProfilerPayload(args), null, 2),
      tool: PROFILER_TOOL,
      model: tier,
      // Hypothesis edits are small structured outputs — much cheaper
      // than the prose-anchor rewrite the v3.1 profiler did. Budget
      // accordingly.
      max_tokens: tier === 'cognition' ? 1500 : 1000,
    },
    ProfilerOutputSchema,
  );
}

/** Tier-by-depth ladder. Haiku in early SEED, Sonnet once the list
 *  starts mattering (after pillars). Close pass is the compiler's job
 *  now, not this agent's. */
export function pickTier(post_opener_turn: number): ModelTier {
  if (post_opener_turn < 10) return 'fast';
  return 'cognition';
}

export type { ProfilerTrigger };
