// Reading cognition agent — Plan-and-Write's PLAN stage.
// Calls the model once at reading start. Output is consumed by persona.

import type { LLMAdapter } from '../survey/adapter';
import { ReadingPlanSchema } from './schemas';
import { READING_COGNITION_SYSTEM, READING_COGNITION_TOOL } from './prompts/cognition';
import type { CognitionInput, CognitionOutput } from './types';

export async function planReading(
  adapter: LLMAdapter,
  input: CognitionInput,
): Promise<CognitionOutput> {
  // Build a tight payload — full card data (so the model has keywords +
  // upright_meaning to use as constraint) plus the brief + the choice +
  // hooks + contradictions. Skip raw picks_log — already digested in the
  // brief.
  const payload = {
    identity: input.profile.identity,
    choice: input.profile.candidates.find((c) => c.is_target) ?? input.profile.candidates[0] ?? null,
    cast: input.profile.cast,
    hunches: input.profile.hunches,
    margin: input.profile.margin,
    cognition_log: input.profile.cognition_log,
    highlights: input.profile.highlights,
    prose_brief: input.prose_brief,
    drawn: {
      spread_id: input.drawn.spread.id,
      spread_name: input.drawn.spread.name,
      cards: input.drawn.cards.map((dc) => ({
        position_id: dc.position.id,
        position_role: dc.position.role,
        position_prompt_label: dc.position.prompt_label,
        card_id: dc.card.id,
        name: dc.card.name,
        arcana: dc.card.arcana,
        keywords: dc.card.keywords,
        upright_meaning: dc.card.upright_meaning,
      })),
    },
    instruction:
      'plan the four-card reading. emit one arc_thesis + four CardAngles in flip order (top, left, right, bottom).',
  };

  return adapter.invoke<CognitionOutput>(
    {
      system: READING_COGNITION_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: READING_COGNITION_TOOL,
      model: 'cognition',
      max_tokens: 2000,
    },
    ReadingPlanSchema,
  );
}
