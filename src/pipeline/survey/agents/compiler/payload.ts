// Compiler input payload builder. Runs once per session, AFTER the
// user has submitted their intention. The user_intention + WEAVER
// candidate set are the primary inputs — the compiler is now a sieve
// that picks (or builds) one Dilemma from the candidate set in light
// of what the user said they came to ask about.

import { formatVerbatimLog } from '../../verbatim-log';
import { renderTranscript } from '../../transcript';
import type { EngineState, VerbatimEntry } from '../../types';

export type CompilerPayloadArgs = {
  state: EngineState;
  /** The user's submitted question. The compiler reads this as the
   *  primary filter signal — see the prompt for the three resolution
   *  paths. Null only when the user pressed "I DON'T KNOW" at the
   *  intent screen. */
  user_intention: string | null;
};

export function buildCompilerPayload(args: CompilerPayloadArgs): unknown {
  const { state, user_intention } = args;
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
    // Primary filter signal — what the user said they came to ask.
    user_intention,
    // Primary candidate set — WEAVER's curated dilemmas with their
    // evidence-anchored thoughts. The compiler picks one (or builds a
    // new one when the intent reveals what WEAVER missed).
    weaver_candidates: state.weaver_candidates,
    // The unified narrative — pillars, seeder observations, assertions
    // and the user's WARM/COLD responses (with corrections) in
    // chronological order.
    transcript: renderTranscript(state.transcript),
    verbatim_log: state.verbatim_log.map(toVerbatimItem),
    verbatim_log_formatted: formatVerbatimLog(state.verbatim_log),
    // Advisory — the detective's last hypothesis list. The compiler
    // should not adopt these unless warmth or WEAVER backs them.
    detective_hypotheses: state.hypotheses,
    doc_v: state.doc.v,
  };
}

function toVerbatimItem(v: VerbatimEntry) {
  return { index: v.index, turn: v.turn, source: v.source, text: v.text };
}
