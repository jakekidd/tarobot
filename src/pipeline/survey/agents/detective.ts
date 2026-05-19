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
      // Detective stays on Sonnet — it's the survey's brain (hypothesis
      // maintenance, contradiction detection, intention guesses). When
      // OSS local LLMs come in, this is the agent that needs the
      // strongest replacement.
      model: 'cognition',
      max_tokens: 1200,
    },
    DetectiveOutputSchema,
  );
}
