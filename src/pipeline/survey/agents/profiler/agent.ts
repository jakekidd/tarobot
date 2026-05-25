// Profiler — v3 whole-doc rewrite of the Subject Anchor.
//
// Trigger logic lives in the engine (every 3 turns + correction events +
// close pass). This file just runs the call.
//
// Tier ladder by depth — driven by post-opener turn count since
// Phase 2 doesn't yet have explicit EXPLORE/EXPLOIT stages (those land
// in Phase 3 with the instruments rewrite):
//
//   turns 0–9     (during pillars / SEED)  → fast (Haiku)
//   turns 10+     (after pillars done)     → cognition (Sonnet)
//   close pass                             → deep (Opus)
//
// The profiler is non-blocking — it doesn't gate the user's next
// question. Detective stays the per-turn latency-critical agent.

import type { LLMAdapter, ModelTier } from '../../../llm/adapter';
import { PROFILER_SYSTEM, PROFILER_TOOL } from './prompt';
import { ProfilerOutputSchema, type ProfilerOutput } from './schema';
import { buildProfilerPayload, type ProfilerPayloadArgs } from './payload';

export type RunProfilerArgs = ProfilerPayloadArgs & {
  /** Post-opener turn count at the moment of the call. Drives the
   *  tier ladder. */
  post_opener_turn: number;
};

export async function runProfiler(
  adapter: LLMAdapter,
  args: RunProfilerArgs,
): Promise<ProfilerOutput> {
  const tier = pickTier(args.post_opener_turn, args.trigger);
  return adapter.invoke(
    {
      system: PROFILER_SYSTEM,
      user: JSON.stringify(buildProfilerPayload(args), null, 2),
      tool: PROFILER_TOOL,
      model: tier,
      // Profiler writes the whole anchor doc; budget generously.
      // Close-pass on Opus gets more headroom than the heartbeat
      // passes on Haiku/Sonnet.
      max_tokens: tier === 'deep' ? 6000 : tier === 'cognition' ? 4000 : 2500,
    },
    ProfilerOutputSchema,
  );
}

/** Tier-by-depth ladder. Heartbeat early = Haiku; later heartbeats =
 *  Sonnet; close pass always = Opus regardless of turn count (this is
 *  the artifact that ships to the seer — max quality matters). */
export function pickTier(post_opener_turn: number, trigger: 'heartbeat' | 'correction' | 'close'): ModelTier {
  if (trigger === 'close') return 'deep';
  if (post_opener_turn < 10) return 'fast';
  return 'cognition';
}
