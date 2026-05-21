// Crowd agent — Haiku, blind to the LivingDoc. Writes 2-3 decoy
// options given only a question stem. Phase 4 question generation.

import type { LLMAdapter } from '../../../llm/adapter';
import { CrowdOutputSchema, type CrowdOutput } from './schema';
import { CROWD_SYSTEM, CROWD_TOOL } from './prompt';

export async function runCrowd(
  adapter: LLMAdapter,
  args: { stem: string },
): Promise<CrowdOutput> {
  const payload = {
    stem: args.stem,
    instruction:
      'write 2-3 honest decoy options a representative crowd would say to this question. all lowercase, ≤40 chars each, no compound options, no duplicates. you do not see any subject context — write what real people would actually say.',
  };
  return adapter.invoke(
    {
      system: CROWD_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: CROWD_TOOL,
      // 'fast' tier = Haiku per src/pipeline/claude.ts tier map.
      model: 'fast',
      max_tokens: 300,
    },
    CrowdOutputSchema,
  );
}
