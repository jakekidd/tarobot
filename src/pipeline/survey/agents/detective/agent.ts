// Detective — v2 prose-shell output, adversarial objective.
//
// Drops from 'deep' (Opus) to 'cognition' (Sonnet) per locked
// architecture. The queue model removes the per-turn latency tax
// that justified the old parallel-firing design, so sequential
// Sonnet is the right cost/quality point.

import type { LLMAdapter } from '../../../llm/adapter';
import type { EngineState, PipelineContext } from '../../types';
import { DetectiveOutputSchema, type DetectiveOutput } from './schema';
import { DETECTIVE_SYSTEM, DETECTIVE_TOOL } from './prompt';
import { buildDetectivePayload } from './payload';

export async function runDetective(
  adapter: LLMAdapter,
  ctx: PipelineContext,
  state: EngineState,
): Promise<DetectiveOutput> {
  return adapter.invoke(
    {
      system: DETECTIVE_SYSTEM,
      user: JSON.stringify(buildDetectivePayload(ctx, state), null, 2),
      tool: DETECTIVE_TOOL,
      // 'cognition' tier — Sonnet. The detective's scratchpad is the
      // largest single output in the survey pipeline so the token
      // budget stays at 4K; quality at this tier is sufficient for
      // adversarial selection given the deterministic ranker already
      // pre-filters the candidate set.
      model: 'cognition',
      max_tokens: 4000,
    },
    DetectiveOutputSchema,
  );
}
