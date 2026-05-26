// Seeder input payload builder. The seeder reads this turn's Q&A in
// context (options, negative space, inversions) + the full history
// + existing notes + verbatim log.

import { formatVerbatimLog } from '../../verbatim-log';
import { getNode } from '../../tree';
import { probeToString } from '../../types';
import type { EngineState, PickEvent, VerbatimEntry } from '../../types';

export type SeederPayloadArgs = {
  state: EngineState;
  /** The just-answered pick (this turn). */
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

  return {
    subject_name: state.profile.name || 'unnamed',
    this_turn: {
      question: pick.question_text,
      options_shown: optionsShown,
      picked,
      negative_space: negativeSpace,
      inversions: inversions ?? '(no authored decoder)',
    },
    history: state.picks_log.slice(0, -1).map(toHistoryItem),
    existing_notes: state.doc.seeder_notes,
    verbatim_log: state.verbatim_log.map(toVerbatimItem),
    verbatim_log_formatted: formatVerbatimLog(state.verbatim_log),
    doc_v: state.doc.v,
  };
}

function toHistoryItem(p: PickEvent, idx: number) {
  return {
    idx,
    q: p.question_text,
    a: p.answer,
    ...(p.instrument_result ? { instrument_result: p.instrument_result } : {}),
  };
}

function toVerbatimItem(v: VerbatimEntry) {
  return { index: v.index, turn: v.turn, source: v.source, text: v.text };
}
