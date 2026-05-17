// Detective — stage 2 of the survey pipeline. Updates the
// investigation (hypotheses, choice draft, contradictions, hooks,
// posture) based on the just-metabolized profile.

import type { LLMAdapter } from '../adapter';
import { DetectiveOutputSchema } from '../schemas';
import { DETECTIVE_SYSTEM, DETECTIVE_TOOL } from '../prompts/detective';
import type { DetectiveOutput, PipelineContext } from '../types';
import { buildAgentPayload } from './payload';

export async function runDetective(
  adapter: LLMAdapter,
  ctx: PipelineContext,
): Promise<DetectiveOutput> {
  return adapter.invoke(
    {
      system: DETECTIVE_SYSTEM,
      user: JSON.stringify(buildAgentPayload(ctx, 'detective'), null, 2),
      tool: DETECTIVE_TOOL,
      model: 'cognition',
      max_tokens: 1600,
    },
    DetectiveOutputSchema,
  );
}
