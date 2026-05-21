// Detective — stage 2 of the survey pipeline. Updates the
// investigation (hypotheses, choice draft, contradictions, hooks,
// posture) based on the just-metabolized profile.

import type { LLMAdapter } from '../../../llm/adapter';
import type { PipelineContext } from '../../types';
import { DetectiveOutputSchema } from './schema';
import { DETECTIVE_SYSTEM, DETECTIVE_TOOL } from './prompt';
import { buildDetectivePayload } from './payload';
import type { DetectiveOutput } from './apply';

export async function runDetective(
  adapter: LLMAdapter,
  ctx: PipelineContext,
): Promise<DetectiveOutput> {
  return adapter.invoke(
    {
      system: DETECTIVE_SYSTEM,
      user: JSON.stringify(buildDetectivePayload(ctx), null, 2),
      tool: DETECTIVE_TOOL,
      // Opus — the detective now does BOTH the investigation update AND
      // the next-question pick, plus an extended private_thoughts
      // scratchpad. The scratchpad is half-or-more of the output, so the
      // total token budget is higher than the old detective-only call.
      // Phase 3 will drop this to 'cognition' (Sonnet) per locked design.
      model: 'deep',
      max_tokens: 4000,
    },
    DetectiveOutputSchema,
  );
}
