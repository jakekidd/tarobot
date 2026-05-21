// Detective payload builder — v2.
//
// Surfaces the LivingDoc + coverage map + the top adversarial
// candidates (the ranked unanswered pool questions). The detective
// reads doc.scaffold.leading_hypothesis as its current best read,
// and picks the candidate that would most BREAK it.

import type { PipelineContext } from '../../types';
import { getPoolNodeIds, getPillars } from '../../tree';
import { rankAdversarial, type AdversarialCandidate } from '../../adversarial';

export function buildDetectivePayload(ctx: PipelineContext) {
  const doc = ctx.doc;

  // Build the unanswered-pool list. Excludes opener ids and anything
  // already in picks_log or asked. The engine passes ctx.queue
  // (head-of-queue at index 0) — those are slated questions but the
  // detective can still rank them along with the wider pool.
  const askedIds = new Set(ctx.history.map((p) => p.node_id));
  const queueIds = new Set(ctx.queue.map((q) => q.node_id));
  // Pool ids the detective can pick from: anything authored that
  // isn't already answered. We don't filter out queue items because
  // the detective's "append" is advisory in Phase 3.
  const available = listAvailablePoolIds(askedIds, queueIds);

  const candidates: AdversarialCandidate[] = rankAdversarial({
    doc,
    coverage: doc.coverage,
    availableNodeIds: available,
    limit: 5,
  });

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
      scaffold: doc.scaffold,
      margin: doc.margin.slice(-8),
      story: doc.story,
      held: doc.held,
    },
    coverage: doc.coverage,
    history,
    adversarial_candidates: candidates,
    instruction:
      'spend at least HALF your response in scratchpad — think out loud. then name your leading_hypothesis (the read you currently most believe; this is the adversarial target). emit story_updates for fields that changed this turn. pick next_move.kind=\'append\' with the candidate node_id from adversarial_candidates whose answer would most break your leading_hypothesis. echo doc.v as based_on_v. NEVER fabricate specifics (instagram, decks, hometowns) — ground claims in supporting picks.',
  };
}

/** Available unanswered pool ids. Excludes openers (engine handles
 *  those), excludes asked, and excludes anything already queued. */
function listAvailablePoolIds(asked: Set<string>, queued: Set<string>): string[] {
  return [...getPillars(), ...getPoolNodeIds()].filter(
    (id) => !asked.has(id) && !queued.has(id),
  );
}
