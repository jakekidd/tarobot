// Profiler input payload builder. The profiler runs much less often
// than the observer (every 3 turns + corrections + close pass) so we
// can afford to hand it a richer context than per-turn agents get.
//
// Contract: this payload is stringified into adapter.invoke's `user`
// field. The profiler's system prompt (materials/prompts/profiler.md)
// documents what each top-level field means.

import { formatAnchorSectionsForPrompt } from '../../anchor-template';
import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, PickEvent, VerbatimEntry } from '../../types';

export type ProfilerTrigger = 'heartbeat' | 'correction' | 'close';

export type ProfilerPayloadArgs = {
  state: EngineState;
  trigger: ProfilerTrigger;
  /** Optional detective-side excerpt — the scratchpad / leading
   *  hypothesis from the most recent detective call. Plain strings so
   *  the profiler can ignore them; not load-bearing for the rewrite. */
  detective_state?: {
    leading_hypothesis?: string;
    scratchpad_excerpt?: string;
    candidate_dilemmas?: string[];
  };
};

export function buildProfilerPayload(args: ProfilerPayloadArgs): unknown {
  const { state, trigger, detective_state } = args;
  return {
    subject_name: state.profile.name || 'unnamed',
    identity: {
      sun_sign: state.profile.sun_sign,
      life_path: state.profile.life_path,
      birth_card: state.profile.birth_card,
      age_bracket: state.profile.age_bracket,
      birth_time_bracket: state.profile.birth_time_bracket,
      relationship_status: state.profile.relationship_status,
    },
    cast: state.profile.cast.map((m) => ({
      label: m.label,
      role: m.likely_role,
      pronouns: m.pronouns,
      off_limits: m.off_limits ?? false,
    })),
    history: state.picks_log.map(toHistoryItem),
    verbatim_log: state.verbatim_log.map(toVerbatimItem),
    verbatim_log_formatted: formatVerbatimLog(state.verbatim_log),
    detective_state: detective_state ?? {},
    prior_anchor: state.anchor,
    trigger,
    template_sections: formatAnchorSectionsForPrompt(),
    doc_v: state.doc.v,
  };
}

function toHistoryItem(p: PickEvent): {
  q: string;
  a: string | string[];
  is_engine_authored?: boolean;
} {
  return {
    q: p.question_text,
    a: p.answer,
    ...(p.is_engine_authored ? { is_engine_authored: true } : {}),
  };
}

function toVerbatimItem(v: VerbatimEntry) {
  return { index: v.index, turn: v.turn, source: v.source, text: v.text };
}
