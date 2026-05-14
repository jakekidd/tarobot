// Reading persona agent — Plan-and-Write's WRITE stage.
// Voices the witch's reading from the plan. One call, all four beats +
// intro + outro at once. UI then sequences the reveal client-side.

import type { LLMAdapter } from '../survey/adapter';
import { ReadingSchema } from './schemas';
import { READING_PERSONA_SYSTEM, READING_PERSONA_TOOL } from './prompts/persona';
import type { PersonaInput, PersonaOutput } from './types';

export async function voiceReading(
  adapter: LLMAdapter,
  input: PersonaInput,
): Promise<PersonaOutput> {
  const payload = {
    identity: input.profile.identity,
    choice: input.profile.candidates.find((c) => c.is_target) ?? input.profile.candidates[0] ?? null,
    cast: input.profile.cast,
    highlights: input.profile.highlights,
    prose_brief: input.prose_brief,
    drawn: input.drawn.cards.map((dc) => ({
      position_id: dc.position.id,
      position_role: dc.position.role,
      card: {
        id: dc.card.id,
        name: dc.card.name,
        keywords: dc.card.keywords,
        upright_meaning: dc.card.upright_meaning,
      },
    })),
    plan: input.plan,
    instruction:
      'voice the reading in the witch\'s style. emit intro + one beat per card position (matching the plan) + outro. mirror, not oracle.',
  };

  return adapter.invoke<PersonaOutput>(
    {
      system: READING_PERSONA_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: READING_PERSONA_TOOL,
      model: 'deep',         // Opus — voice quality is load-bearing here
      max_tokens: 2500,
    },
    ReadingSchema,
  );
}
