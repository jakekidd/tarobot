// Observer payload builder. Two modes — `live` (every post-opener
// turn) and `final` (end-of-survey synthesis pass with full Q&A
// history and explicit permission to retroactively revise Q1-5 reads).
//
// The two modes share most of the input shape but differ in the
// `instruction` field and `tentative_seeds` semantics. Kept colocated
// here rather than split across two files because the diff is small
// and the comparison is easier to read in one place.

import type { PipelineContext } from '../../types';

export type ObserverPayloadMode = 'live' | 'final';

export function buildObserverPayload(ctx: PipelineContext, mode: ObserverPayloadMode) {
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
  const investigation = compactInvestigationForObserver(ctx.investigation);
  const cast = ctx.profile.cast.map((m) => ({
    label: m.label,
    likely_role: m.likely_role,
    pronouns: m.pronouns,
    color: m.color,
    off_limits: m.off_limits,
    notes: m.notes,
  }));

  if (mode === 'live') {
    // tentative seeds added by the algorithmic seeder THIS turn. We
    // mark them as "fresh" so the observer knows which to walk through
    // first. (Seeds from prior turns are aged via age_in_turns and
    // live in investigation.hypotheses.tentative.)
    const tentativeSeeds = ctx.investigation.hypotheses.tentative.filter(
      (h) => h.age_in_turns === 0 && h.seeded,
    );
    return {
      profile_body: ctx.profile.body,
      profile_hooks: ctx.profile.hooks,
      profile_edges: ctx.profile.edges,
      profile_side_channel: ctx.profile.side_channel,
      cast,
      this_turn,
      history,
      investigation,
      tentative_seeds: tentativeSeeds,
      instruction:
        'rewrite profile.body integrating this turn\'s evidence. update hooks/edges/side_channel. note any cast members whose role in the subject\'s psychology changed this turn. walk through tentative_seeds AND any older tentative items — emit hypothesis_ladder_moves where evidence supports a rung change. when supporting AND refuting evidence both exist, move to "contested" — the seer hunts there.',
    };
  }
  // mode === 'final'
  return {
    profile_body: ctx.profile.body,
    profile_hooks: ctx.profile.hooks,
    profile_edges: ctx.profile.edges,
    profile_side_channel: ctx.profile.side_channel,
    cast,
    history,
    investigation,
    tentative_seeds: [],
    instruction:
      'FINAL SYNTHESIS PASS. you have seen every answer the subject gave. this is your last chance to revise profile.body before the seer reads it. priorities, in order: (1) RE-EVALUATE Q1-5 with full survey context — early answers are typically curated; what the subject said about themselves in Q1-5 should now be read THROUGH everything that came after. integrate. revise. (2) populate ## tensions — Q&A pairs that disagree, performed-self vs lived-self mismatches. THIS is the seer\'s richest mining ground; don\'t leave it empty. (3) the LIVING DOCUMENT discipline still applies — rewrite, don\'t append. ALSO: leave hypothesis_ladder_moves empty (detective is done), leave cast_notes_updates empty unless you have NEW evidence the per-turn passes missed. hooks/edges/side_channel are now engine-extracted; emit empty arrays for them.',
  };
}

// Observer's investigation view differs slightly from the
// shared.compactInvestigation: observer cares less about choice_draft /
// posture (detective's domain) but needs the same ladder + story
// snapshot. Kept local to avoid coupling to shared.ts.
function compactInvestigationForObserver(i: PipelineContext['investigation']) {
  const ladderTotal =
    i.hypotheses.confirmed.length + i.hypotheses.probable.length +
    i.hypotheses.tentative.length + i.hypotheses.contested.length +
    i.hypotheses.refuted.length + i.hypotheses.held.length;
  const storyHasContent =
    i.story.fork !== null || i.story.present_pressure !== null ||
    i.story.past_root !== null || i.story.stakes !== null ||
    i.story.hooks.length > 0;
  return {
    hypotheses: ladderTotal > 0 ? i.hypotheses : undefined,
    story: storyHasContent ? i.story : undefined,
    choice_draft: i.choice_draft ?? undefined,
    contradictions: i.contradictions.length > 0 ? i.contradictions : undefined,
    hooks: i.hooks.length > 0 ? i.hooks : undefined,
    active_threads: i.active_threads.length > 0 ? i.active_threads : undefined,
    posture: i.posture ?? undefined,
  };
}
