// Compiler input payload builder. Runs once at survey close. Feeds the
// unified transcript (primary input), verbatim log, identity, cast,
// detective state (advisory), PSYCH candidates (when PSYCH ships;
// null for now), template sections.

import { formatAnchorSectionsForPrompt } from '../../anchor-template';
import { formatVerbatimLog } from '../../verbatim-log';
import { renderTranscript } from '../../transcript';
import type { EngineState, VerbatimEntry } from '../../types';

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
    // Primary input — the unified narrative.
    transcript: renderTranscript(state.transcript),
    verbatim_log: state.verbatim_log.map(toVerbatimItem),
    verbatim_log_formatted: formatVerbatimLog(state.verbatim_log),
    detective_state: {
      leading_hypothesis: state.doc.scaffold.leading_hypothesis,
      hypotheses: state.hypotheses,
    },
    // PSYCH ships next — when it does, the engine populates this from
    // state.psych_candidates. Until then the compiler reads detective_
    // state directly and treats null here as "no PSYCH metabolization
    // yet, fall back to detective_state."
    psych_candidates: null,
    template_sections: formatAnchorSectionsForPrompt(),
    doc_v: state.doc.v,
  };
}

function toVerbatimItem(v: VerbatimEntry) {
  return { index: v.index, turn: v.turn, source: v.source, text: v.text };
}
