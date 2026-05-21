// Detective payload builder. Sees the current profile snapshot, the
// investigation, this turn's Q&A, the full Q&A history, the next N
// queue items (text-only — internal node ids are deliberately hidden),
// and its own scratchpad from prior turns.

import { probeToString } from '../../types';
import type { PipelineContext } from '../../types';
import { getNode as getNodeFromCtx } from '../../tree';
import { compactProfile, compactInvestigation } from '../shared';

const DETECTIVE_QUEUE_WINDOW = 5;

export function buildDetectivePayload(ctx: PipelineContext) {
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
  }));
  const queueWindow = ctx.queue.slice(0, DETECTIVE_QUEUE_WINDOW).map((q, i) => {
    const node = q.node_id ? getNodeFromCtx(q.node_id) : null;
    return {
      index: i,
      question: node ? node.q : '(question text not resolved)',
      probe: probeToString(node?.probe),
      format: node?.f,
      current_options: q.options_override
        ?? (node?.a ? node.a.map((t) => t[0]) : undefined),
      preamble: q.preamble,
    };
  });
  return {
    this_turn,
    profile: compactProfile(ctx.profile),
    investigation: compactInvestigation(ctx.investigation),
    history,
    queue_upcoming: queueWindow,
    detective_log: ctx.detective_log ?? [],
    // current_understanding dropped in v2 — see types.ts. Detective
    // prompt still mentions it (legacy); engine ignores any emitted
    // value. Phase 3 rewrites prompt + emits StoryObject instead.
    instruction:
      'spend at least half the response in private_thoughts (think out loud). update investigation by CHANGES ONLY. emit queue_edits for any of the upcoming questions (indices 0..N-1) whose options should be personalized; index 0 is the very next question. inject a guess only at hypothesis confidence ≥0.6.',
  };
}
