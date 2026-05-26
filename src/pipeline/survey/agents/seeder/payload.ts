// Seeder input payload builder.
//
// Reads the unified transcript (pillar picks with negative space +
// prior seeder observations interleaved) and the current turn's pick
// in detail. The seeder appends 0-6 observations to the transcript.

import { formatVerbatimLog } from '../../verbatim-log';
import { renderTranscript } from '../../transcript';
import { getNode } from '../../tree';
import { probeToString } from '../../types';
import type { EngineState, PickEvent, VerbatimEntry } from '../../types';

export type SeederPayloadArgs = {
  state: EngineState;
  /** The just-answered pillar pick. */
  pick: PickEvent;
};

export function buildSeederPayload(args: SeederPayloadArgs): unknown {
  const { state, pick } = args;
  const node = getNode(pick.node_id);
  const optionsShown = pick.options_shown ?? [];
  const pickedRaw = pick.answer;
  const picked = typeof pickedRaw === 'string' ? pickedRaw : pickedRaw.join(', ');
  const negativeSpace = optionsShown.filter((opt) => {
    if (typeof pickedRaw === 'string') return opt !== pickedRaw;
    return !pickedRaw.includes(opt);
  });
  const inversions = node ? probeToString(node.probe) : undefined;
  // The transcript already includes this turn's pick (engine pushed it
  // before calling the seeder). Render the full thing so the seeder
  // sees the chronological flow.
  const transcript = renderTranscript(state.transcript);

  return {
    subject_name: state.profile.name || 'unnamed',
    identity: {
      sun_sign: state.profile.sun_sign,
      life_path: state.profile.life_path,
      birth_card: state.profile.birth_card,
      age_bracket: state.profile.age_bracket,
    },
    transcript,
    this_turn: {
      question: pick.question_text,
      options_shown: optionsShown,
      picked,
      skipped: negativeSpace,
      inversions: inversions ?? '(no authored decoder)',
    },
    verbatim_log: state.verbatim_log.map(toVerbatimItem),
    verbatim_log_formatted: formatVerbatimLog(state.verbatim_log),
    doc_v: state.doc.v,
  };
}

function toVerbatimItem(v: VerbatimEntry) {
  return { index: v.index, turn: v.turn, source: v.source, text: v.text };
}
