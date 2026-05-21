// Observer — v2 single writer of LivingDoc, delta-on-scaffold output.
//
// Sequential discipline: this agent is the sole writer of doc. It
// reads at doc.v = N, emits a delta with based_on_v=N. The engine
// applies the delta only if the doc is still at v=N (staleness gate).

import type { LLMAdapter } from '../../../llm/adapter';
import type { PipelineContext } from '../../types';
import { ObserverOutputSchema, type ObserverOutput } from './schema';
import { OBSERVER_SYSTEM, OBSERVER_TOOL } from './prompt';
import { buildObserverPayload } from './payload';

export async function runObserver(
  adapter: LLMAdapter,
  ctx: PipelineContext,
): Promise<ObserverOutput> {
  return adapter.invoke(
    {
      system: OBSERVER_SYSTEM,
      user: JSON.stringify(buildObserverPayload(ctx, 'live'), null, 2),
      tool: OBSERVER_TOOL,
      // Sonnet — quality matters more than latency. Per-turn
      // cognition; the rolling queue (Phase 4) hides this latency
      // behind buffered head/tail.
      model: 'cognition',
      max_tokens: 2000,
    },
    ObserverOutputSchema,
  );
}

/** End-of-survey final pass. Different framing — explicit permission
 *  to retroactively revise early reads now that the full history is
 *  visible. Same schema, same apply path. */
export async function runFinalObserver(
  adapter: LLMAdapter,
  ctx: PipelineContext,
): Promise<ObserverOutput> {
  return adapter.invoke(
    {
      system: OBSERVER_SYSTEM,
      user: JSON.stringify(buildObserverPayload(ctx, 'final'), null, 2),
      tool: OBSERVER_TOOL,
      model: 'cognition',
      max_tokens: 3000,
    },
    ObserverOutputSchema,
  );
}
