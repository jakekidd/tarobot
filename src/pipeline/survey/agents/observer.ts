// Observer — stage 1 of the survey pipeline. Metabolizes the latest
// answer into profile notes + cast updates.

import type { LLMAdapter } from '../../llm/adapter';
import { ObserverOutputSchema } from '../schemas';
import { OBSERVER_SYSTEM, OBSERVER_TOOL } from '../prompts/observer';
import type { ObserverOutput, PipelineContext } from '../types';
import { buildAgentPayload } from './payload';

export async function runObserver(
  adapter: LLMAdapter,
  ctx: PipelineContext,
): Promise<ObserverOutput> {
  return adapter.invoke(
    {
      system: OBSERVER_SYSTEM,
      user: JSON.stringify(buildAgentPayload(ctx, 'observer'), null, 2),
      tool: OBSERVER_TOOL,
      // Observer fires sparsely (every Nth turn) and metabolizes a window
      // of recent picks. Sonnet — quality matters more than latency
      // because cross-turn observation is the agent's whole job.
      model: 'cognition',
      max_tokens: 2000,
    },
    ObserverOutputSchema,
  );
}

/** End-of-survey synthesis call. Same agent, same schema — different
 *  framing in the user payload. Fires once after the last pick, before
 *  Augur. Gives the observer the full Q&A history and explicit
 *  permission to retroactively revise Q1-5 reads and populate ## tensions. */
export async function runFinalObserver(
  adapter: LLMAdapter,
  ctx: PipelineContext,
): Promise<ObserverOutput> {
  return adapter.invoke(
    {
      system: OBSERVER_SYSTEM,
      user: JSON.stringify(buildAgentPayload(ctx, 'observer-final'), null, 2),
      tool: OBSERVER_TOOL,
      model: 'cognition',
      max_tokens: 3000,
    },
    ObserverOutputSchema,
  );
}
