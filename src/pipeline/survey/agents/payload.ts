// Build the user-message payload for any of the three pipeline agents.
// The PipelineContext shape is shared, but each agent has slightly
// different needs — keeping this in one place makes the differences
// visible and easy to tune.

import type { PipelineContext } from '../types';

type Stage = 'observer' | 'detective';

export function buildAgentPayload(ctx: PipelineContext, stage: Stage) {
  // The just-answered question + the user's pick are the focal point
  // for all three stages. Compact representation.
  const this_turn = {
    turn_index: ctx.index,
    question: ctx.question,
    options_shown: ctx.options_shown,
    answer: ctx.answer,
  };

  // Compress history: question text + options + answer per turn.
  // Drop node_id internals; the agents care about content, not ids
  // (the interrogator uses basket ids separately, see below).
  const history = ctx.history.map((p) => ({
    node_id: p.node_id,
    question: p.question_text,
    options: p.options_shown,
    answer: p.answer,
    latency_ms: p.latency_ms,
  }));

  // Profile snapshot — pruned of empty sections to save tokens.
  const profile = compactProfile(ctx.profile);

  // Investigation snapshot — same idea.
  const investigation = compactInvestigation(ctx.investigation);

  switch (stage) {
    case 'observer': {
      // Observer fires every Nth turn (engine's OBSERVER_INTERVAL) and
      // metabolizes a window of recent picks at once. `recent_picks` is
      // the window; `history` is everything BEFORE that window (older
      // context, for cross-referencing and de-duping notes).
      const recent = ctx.recent_picks ?? [];
      const recentIds = new Set(recent.map((p) => p.node_id));
      const olderHistory = history.filter((h) => !recentIds.has(h.node_id));
      return {
        // Each entry: node_id + question + options + answer + latency.
        recent_picks: recent.map((p) => ({
          node_id: p.node_id,
          question: p.question_text,
          options: p.options_shown,
          answer: p.answer,
          latency_ms: p.latency_ms,
        })),
        profile,
        investigation,
        history: olderHistory,
        instruction:
          'metabolize the recent_picks window into profile notes + cast updates. file only what is worth filing across these turns.',
      };
    }
    case 'detective': {
      // Detective is now the combined investigator + question-picker.
      // Gets profile + investigation + history + basket + queue (so it
      // doesn't double-pick something already queued) + its own running
      // scratchpad. Carries the user's stated `initial_intention` if any.
      return {
        this_turn,
        profile,
        investigation,
        history,
        queue_upcoming: ctx.queue.map((q) => ({
          node_id: q.node_id,
          preamble: q.preamble,
        })),
        basket: ctx.basket,
        detective_log: ctx.detective_log ?? [],
        instruction:
          'spend at least half the response in private_thoughts (think out loud). update investigation by changes only. pick next_question from basket; inject a guess only at hypothesis confidence ≥0.6.',
      };
    }
  }
}

function compactProfile(p: PipelineContext['profile']) {
  return {
    identity: {
      name: p.name || undefined,
      sun_sign: p.sun_sign,
      life_path: p.life_path,
      birth_card: p.birth_card,
      age_bracket: p.age_bracket,
      birth_time_bracket: p.birth_time_bracket,
      initial_intention: p.initial_intention,
    },
    sections: Object.fromEntries(
      Object.entries(p.sections).filter(([, notes]) => notes.length > 0),
    ),
    cast: p.cast,
  };
}

function compactInvestigation(i: PipelineContext['investigation']) {
  return {
    hypotheses: i.hypotheses.length > 0 ? i.hypotheses : undefined,
    choice_draft: i.choice_draft ?? undefined,
    contradictions: i.contradictions.length > 0 ? i.contradictions : undefined,
    hooks: i.hooks.length > 0 ? i.hooks : undefined,
    active_threads: i.active_threads.length > 0 ? i.active_threads : undefined,
    posture: i.posture ?? undefined,
  };
}
