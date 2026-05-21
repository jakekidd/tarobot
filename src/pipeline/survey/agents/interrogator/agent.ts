// Interrogator agent — Haiku. Phrases the question stem from the
// detective's intent + a small phrasing scaffold of sample questions.

import type { LLMAdapter } from '../../../llm/adapter';
import { InterrogatorOutputSchema, type InterrogatorOutput } from './schema';
import { INTERROGATOR_SYSTEM, INTERROGATOR_TOOL } from './prompt';

export type InterrogatorInput = {
  intent: { angle: string; planted_options?: string[] };
  /** 2-3 sample questions from the authored pool that match the
   *  voice + length the interrogator should mirror. */
  sample_questions: string[];
};

export async function runInterrogator(
  adapter: LLMAdapter,
  args: InterrogatorInput,
): Promise<InterrogatorOutput> {
  const payload = {
    intent: args.intent,
    sample_questions: args.sample_questions,
    instruction:
      'write a single question stem the user will see. all lowercase, ≤120 chars, ends with ?, single sentence. match the voice of sample_questions. tag the dimension this tests in axis_tag.',
  };
  return adapter.invoke(
    {
      system: INTERROGATOR_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: INTERROGATOR_TOOL,
      model: 'fast',
      max_tokens: 300,
    },
    InterrogatorOutputSchema,
  );
}
