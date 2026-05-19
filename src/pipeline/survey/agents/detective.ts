// Detective — stage 2 of the survey pipeline. Updates the
// investigation (hypotheses, choice draft, contradictions, hooks,
// posture) based on the just-metabolized profile.

import type { LLMAdapter } from '../../llm/adapter';
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
      // Opus — the detective now does BOTH the investigation update AND
      // the next-question pick, plus an extended private_thoughts
      // scratchpad. The scratchpad is half-or-more of the output, so the
      // total token budget is higher than the old detective-only call.
      // When OSS local LLMs come in, this is the highest-bar replacement.
      model: 'deep',
      max_tokens: 4000,
    },
    DetectiveOutputSchema,
  );
}
