// Investigator agent — wraps adapter call. Builds a tighter user payload
// than the Observer (the Investigator's job is fast & lean). Always returns
// a node_id that's either from available_nodes or 'GENERATED'.

import type { LLMAdapter } from '../adapter';
import { InvestigatorOutputSchema } from '../schemas';
import { INVESTIGATOR_SYSTEM, INVESTIGATOR_TOOL } from '../prompts/investigator';
import type { InvestigatorInput, InvestigatorOutput } from '../types';

export async function runInvestigator(
  adapter: LLMAdapter,
  input: InvestigatorInput,
): Promise<InvestigatorOutput> {
  const s = input.state;
  const userPayload = {
    phase: s.phase,
    heat: s.heat,
    profile_key_fields: {
      name: s.profile.name,
      sun_sign: s.profile.sun_sign,
      birth_card: s.profile.birth_card,
      has_question_mode: s.profile.has_question_mode,
    },
    choice_draft_summary: s.choice_draft && {
      fork: s.choice_draft.fork,
      confidence: s.choice_draft.confidence,
      is_stated: s.choice_draft.is_stated,
    },
    recent_picks: s.picks_log.slice(-8),
    active_threads: s.active_threads.filter((t) => t.status !== 'refuted' && t.status !== 'confirmed'),
    available_nodes: input.available_nodes,
    asked_node_ids: s.asked_node_ids,
  };

  return adapter.invoke(
    {
      system: INVESTIGATOR_SYSTEM,
      user: JSON.stringify(userPayload, null, 2),
      tool: INVESTIGATOR_TOOL,
      model: 'cognition',
      max_tokens: 800,
    },
    InvestigatorOutputSchema,
  );
}
