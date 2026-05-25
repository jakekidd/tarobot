// Profiler input payload builder — v3.2 hypothesis curator shape.
//
// The profiler reads history + verbatim + existing hypothesis list +
// detective state, and emits hypothesis_edits. No prior-anchor input;
// the profiler doesn't produce prose anymore.

import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, PickEvent, VerbatimEntry } from '../../types';
import type { Probe } from '../../living-doc';

export type ProfilerTrigger = 'heartbeat' | 'correction';

export type ProfilerPayloadArgs = {
  state: EngineState;
  trigger: ProfilerTrigger;
  /** Optional detective-side excerpt — the leading hypothesis + a
   *  short list of candidate Dilemma claims. The profiler may use
   *  these as leads. */
  detective_state?: {
    leading_hypothesis?: string;
    candidate_dilemma_claims?: string[];
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
    existing_hypotheses: state.doc.held.map(toHypothesisItem),
    detective_state: detective_state ?? {},
    trigger,
    doc_v: state.doc.v,
  };
}

function toHistoryItem(p: PickEvent, idx: number): {
  idx: number;
  q: string;
  a: string | string[];
  is_engine_authored?: boolean;
  instrument_result?: PickEvent['instrument_result'];
} {
  return {
    idx,
    q: p.question_text,
    a: p.answer,
    ...(p.is_engine_authored ? { is_engine_authored: true } : {}),
    ...(p.instrument_result ? { instrument_result: p.instrument_result } : {}),
  };
}

function toVerbatimItem(v: VerbatimEntry) {
  return { index: v.index, turn: v.turn, source: v.source, text: v.text };
}

function toHypothesisItem(h: Probe) {
  return {
    id: h.id,
    claim: h.claim,
    source: h.source,
    status: h.status ?? 'untested',
    confidence: h.confidence,
    evidence_refs: h.evidence_refs,
    age_in_turns: h.age_in_turns,
  };
}
