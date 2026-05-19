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
      // Haiku — observer's job is bounded (file ≤3 notes + cast updates).
      // ~3-5x faster than Sonnet. Quality risk is low because the rules
      // (one fact per note, third person, present tense) are concrete.
      model: 'fast',
      max_tokens: 800,
    },
    ObserverOutputSchema,
  );
}
