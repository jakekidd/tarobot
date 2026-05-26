// Seeder agent — Haiku, per-turn, free-form notes.
//
// Fires on every post-opener answer (same trigger as the rest of the
// pipeline). Cheap by design — Haiku, 800-token budget, no thinking.
// The detective consumes the accumulated note list alongside the full
// history.

import type { LLMAdapter } from '../../../llm/adapter';
import { SEEDER_SYSTEM, SEEDER_TOOL } from './prompt';
import { SeederOutputSchema, type SeederOutput } from './schema';
import { buildSeederPayload, type SeederPayloadArgs } from './payload';

export async function runSeeder(
  adapter: LLMAdapter,
  args: SeederPayloadArgs,
): Promise<SeederOutput> {
  return adapter.invoke(
    {
      system: SEEDER_SYSTEM,
      user: JSON.stringify(buildSeederPayload(args), null, 2),
      tool: SEEDER_TOOL,
      model: 'fast',
      max_tokens: 800,
    },
    SeederOutputSchema,
  );
}
