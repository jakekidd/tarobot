// Interrogator — stage 3 of the survey pipeline. Picks the next
// question from the basket, optionally adds a preamble + options
// override.

import type { LLMAdapter } from '../../llm/adapter';
import { InterrogatorOutputSchema } from '../schemas';
import { INTERROGATOR_SYSTEM, INTERROGATOR_TOOL } from '../prompts/interrogator';
import type { InterrogatorOutput, PipelineContext } from '../types';
import { buildAgentPayload } from './payload';

export async function runInterrogator(
  adapter: LLMAdapter,
  ctx: PipelineContext,
): Promise<InterrogatorOutput> {
  return adapter.invoke(
    {
      system: INTERROGATOR_SYSTEM,
      user: JSON.stringify(buildAgentPayload(ctx, 'interrogator'), null, 2),
      tool: INTERROGATOR_TOOL,
      // Haiku — interrogator's job is bounded (pick from basket + optional
      // preamble). ~3-5x faster than Sonnet. Matches the long-term plan
      // where this agent moves to a local OSS LLM on the booth.
      model: 'fast',
      max_tokens: 500,
    },
    InterrogatorOutputSchema,
  );
}
