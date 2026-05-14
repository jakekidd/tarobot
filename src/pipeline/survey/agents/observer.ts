// Observer agent — wraps the adapter call. Builds a compressed user payload
// from the engine state, fires through the adapter, returns validated output.

import type { LLMAdapter } from '../adapter';
import { ObserverOutputSchema } from '../schemas';
import { OBSERVER_SYSTEM, OBSERVER_TOOL } from '../prompts/observer';
import type { ObserverInput, ObserverOutput } from '../types';

export async function runObserver(
  adapter: LLMAdapter,
  input: ObserverInput,
): Promise<ObserverOutput> {
  const userPayload = {
    state_snapshot: compressState(input),
    latest_pick: input.latest_pick,
    relevant_interp: input.relevant_interp,
  };

  return adapter.invoke(
    {
      system: OBSERVER_SYSTEM,
      user: JSON.stringify(userPayload, null, 2),
      tool: OBSERVER_TOOL,
      model: 'cognition',
      max_tokens: 2000,
    },
    ObserverOutputSchema,
  );
}

/**
 * Build a compact view of EngineState for the Observer. Drops fields that
 * inflate the prompt without helping (timing_log, heat history, raw queue
 * internals). Keep the fields the analyst needs.
 */
function compressState(input: ObserverInput) {
  const s = input.state;
  return {
    session_id: s.session_id,
    profile: s.profile,
    is_returning_user: s.is_returning_user,
    prior_session_summary: s.prior_session_summary,
    choice_draft: s.choice_draft,
    hypotheses: s.hypotheses,
    active_threads: s.active_threads,
    picks_log: s.picks_log,
    asked_node_ids: s.asked_node_ids,
    heat: s.heat,
    phase: s.phase,
  };
}
