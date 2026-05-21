// Observer payload builder — v2.
//
// Surfaces the LivingDoc's scaffold + recent margin + held probes,
// the computed identity (so the model doesn't fabricate astrology),
// the latest Q&A, and the full history. The observer reads all of
// this and emits a delta-on-scaffold patch.

import type { PipelineContext } from '../../types';

export type ObserverPayloadMode = 'live' | 'final';

const RECENT_MARGIN_WINDOW = 8;

export function buildObserverPayload(ctx: PipelineContext, mode: ObserverPayloadMode) {
  const doc = ctx.doc;
  const recentMargin = doc.margin.slice(-RECENT_MARGIN_WINDOW);
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
  const identity = {
    name: ctx.profile.name || undefined,
    sun_sign: ctx.profile.sun_sign,
    life_path: ctx.profile.life_path,
    birth_card: ctx.profile.birth_card,
    age_bracket: ctx.profile.age_bracket,
    birth_time_bracket: ctx.profile.birth_time_bracket,
    initial_intention: ctx.profile.initial_intention,
  };
  const cast = ctx.profile.cast.map((m) => ({
    label: m.label,
    likely_role: m.likely_role,
    pronouns: m.pronouns,
    color: m.color,
    off_limits: m.off_limits,
  }));
  const doc_scaffold = {
    leading_hypothesis: doc.scaffold.leading_hypothesis,
    axes: doc.scaffold.axes,
    cast_notes: doc.scaffold.cast_notes,
    fork: doc.scaffold.fork,
    tells: doc.scaffold.tells,
    temporal_lean: doc.scaffold.temporal_lean,
  };
  const doc_held = doc.held.map((p) => ({
    id: p.id,
    claim: p.claim,
    source: p.source,
    age_in_turns: p.age_in_turns,
  }));

  if (mode === 'live') {
    return {
      identity,
      doc_scaffold,
      doc_margin: recentMargin,
      doc_held,
      doc_v: doc.v,
      cast,
      this_turn,
      history,
      instruction:
        'emit a delta-on-scaffold patch integrating this_turn\'s evidence. update only axes that changed; emit cast_updates only for cast members whose role in the subject\'s psychology shifted; flag new tells (especially latency outliers); add ONE margin_append if there\'s a high-variance observation worth remembering. walk through doc_held — elevate confirmed probes, refute contradicted ones. echo doc_v as based_on_v.',
    };
  }
  // mode === 'final'
  return {
    identity,
    doc_scaffold,
    doc_margin: recentMargin,
    doc_held,
    doc_v: doc.v,
    cast,
    history,
    instruction:
      'FINAL SYNTHESIS. you have seen every answer. last pass to revise the doc before the seer reads it. priorities: (1) re-evaluate Q1-5 reads through everything that came after; (2) make sure the leading hypothesis (in scaffold) names a real tension — file it as an axis if missing; (3) set temporal_lean if it\'s still null. emit the consolidating delta. echo doc_v as based_on_v.',
  };
}
