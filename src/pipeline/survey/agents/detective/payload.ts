// Detective payload builder — seeder pivot.
//
// Reads the Seeder's accumulated free-form notes alongside the full
// history. No more scaffold / coverage / adversarial-candidate-pool —
// the detective's primary input is now the note stream the Seeder
// builds per turn.

import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, PipelineContext } from '../../types';

export function buildDetectivePayload(ctx: PipelineContext, state: EngineState) {
  const doc = ctx.doc;

  const this_turn = {
    turn_index: ctx.index,
    question: ctx.question,
    options_shown: ctx.options_shown,
    answer: ctx.answer,
  };
  const history = ctx.history.map((p) => ({
    node_id: p.node_id,
    question: p.question_text,
    options: p.options_shown,
    answer: p.answer,
    latency_ms: p.latency_ms,
    is_engine_authored: p.is_engine_authored ?? false,
    ...(p.instrument_result ? { instrument_result: p.instrument_result } : {}),
  }));
  const profile = {
    identity: {
      name: ctx.profile.name || undefined,
      sun_sign: ctx.profile.sun_sign,
      life_path: ctx.profile.life_path,
      birth_card: ctx.profile.birth_card,
      age_bracket: ctx.profile.age_bracket,
      birth_time_bracket: ctx.profile.birth_time_bracket,
      initial_intention: ctx.profile.initial_intention,
    },
    cast: ctx.profile.cast,
  };

  return {
    this_turn,
    profile,
    doc: {
      v: doc.v,
      seeder_notes: doc.seeder_notes,
      // story handed off downstream (seer + augur); detective can
      // extend via story_updates when ready.
      story: doc.story,
    },
    history,
    verbatim_log: state.verbatim_log.map((v) => ({
      index: v.index, turn: v.turn, source: v.source, text: v.text,
    })),
    verbatim_log_formatted: formatVerbatimLog(state.verbatim_log),
    instruction:
      'read the seeder notes alongside the history. spend at least HALF your response in scratchpad — think out loud about what to test. then name your leading_hypothesis (the current best read) and emit a next_move (assertion preferred). echo doc.v as based_on_v. NEVER fabricate specifics.',
  };
}
