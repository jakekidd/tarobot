// Build the user-message payload for any of the three pipeline agents.
// The PipelineContext shape is shared, but each agent has slightly
// different needs — keeping this in one place makes the differences
// visible and easy to tune.

import type { PipelineContext } from '../types';

type Stage = 'observer' | 'detective' | 'interrogator';

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
      // Observer doesn't need the basket OR the upcoming queue; it's
      // focused on metabolizing this turn into profile notes. It DOES
      // want history + investigation for context (so notes don't
      // duplicate what's already on file).
      return {
        this_turn,
        profile,
        investigation,
        history,
        instruction: 'file profile-grade notes + cast updates. only what is worth filing.',
      };
    }
    case 'detective': {
      // Detective sees the OBSERVER'S updated profile + the full
      // investigation. No basket needed (it doesn't pick questions).
      return {
        this_turn,
        profile,
        investigation,
        history,
        instruction: 'update the investigation. emit only changes. mark refuted hypotheses refuted.',
      };
    }
    case 'interrogator': {
      // Interrogator needs the basket (to pick from) + the upcoming
      // queue (to avoid redundancy) + the detective's leads. Profile
      // is light support; investigation is the real driver.
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
        instruction: 'pick the next question from basket. inject a guess only at hypothesis confidence ≥0.6.',
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
      has_question_mode: p.has_question_mode,
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
