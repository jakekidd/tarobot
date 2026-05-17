// Interrogator — stage 3 of the survey pipeline. Picks the next
// question from the basket, optionally adds a preamble + options
// override.

import type { LLMAdapter } from '../adapter';
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
      model: 'cognition',
      max_tokens: 1000,
    },
    InterrogatorOutputSchema,
  );
}
