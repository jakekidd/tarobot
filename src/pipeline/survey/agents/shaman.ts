// Shaman — end-of-survey blocking step. Reads the full record and
// the detective's intention-guess stack, returns 4 candidate
// intention questions for the user to pick from.

import type { LLMAdapter } from '../../llm/adapter';
import { ShamanOutputSchema } from '../schemas';
import { SHAMAN_SYSTEM, SHAMAN_TOOL } from '../prompts/shaman';
import type { ShamanInput, ShamanOutput } from '../types';

export async function runShaman(
  adapter: LLMAdapter,
  input: ShamanInput,
): Promise<ShamanOutput> {
  const payload = {
    profile: input.profile,
    investigation: {
      hypotheses: input.investigation.hypotheses,
      choice_draft: input.investigation.choice_draft,
      contradictions: input.investigation.contradictions,
      hooks: input.investigation.hooks,
      active_threads: input.investigation.active_threads,
      posture: input.investigation.posture,
      // The full stack with redundancies preserved — order is oldest
      // to newest, so later entries reflect a more informed detective.
      intention_guesses: input.investigation.intention_guesses,
    },
    history: input.history.map((p) => ({
      node_id: p.node_id,
      question: p.question_text,
      options: p.options_shown,
      answer: p.answer,
      latency_ms: p.latency_ms,
    })),
    instruction:
      'divine exactly 4 specific intention questions in the user\'s vernacular.',
  };

  return adapter.invoke(
    {
      system: SHAMAN_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: SHAMAN_TOOL,
      model: 'cognition',
      max_tokens: 800,
    },
    ShamanOutputSchema,
  );
}
