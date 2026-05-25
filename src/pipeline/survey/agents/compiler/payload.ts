// Compiler input payload builder. Runs once at survey close — gets the
// full history + the profiler's curated hypothesis list + the verbatim
// log + the anchor template, and produces the prose Subject Anchor.

import { formatAnchorSectionsForPrompt } from '../../anchor-template';
import { formatVerbatimLog } from '../../verbatim-log';
import type { EngineState, PickEvent, VerbatimEntry } from '../../types';
import type { Probe } from '../../living-doc';

export type CompilerPayloadArgs = {
  state: EngineState;
};

export function buildCompilerPayload(args: CompilerPayloadArgs): unknown {
  const { state } = args;
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
    existing_hypotheses: state.doc.held.map(toHypothesisItem),
    history: state.picks_log.map(toHistoryItem),
    verbatim_log: state.verbatim_log.map(toVerbatimItem),
    verbatim_log_formatted: formatVerbatimLog(state.verbatim_log),
    detective_state: {
      leading_hypothesis: state.doc.scaffold.leading_hypothesis,
      candidate_dilemma_claims: state.doc.held.map((h) => h.claim),
    },
    template_sections: formatAnchorSectionsForPrompt(),
    doc_v: state.doc.v,
  };
}

function toHistoryItem(p: PickEvent, idx: number) {
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
