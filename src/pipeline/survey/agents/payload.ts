// Build the user-message payload for any of the three pipeline agents.
// The PipelineContext shape is shared, but each agent has slightly
// different needs — keeping this in one place makes the differences
// visible and easy to tune.

import { probeToString } from '../types';
import type { PipelineContext } from '../types';
import { getNode as getNodeFromCtx } from '../tree';

type Stage = 'observer' | 'observer-final' | 'detective';

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
      // Observer fires every post-opener turn (Phase G+). Payload
      // gives the observer the FULL profile state (body + hooks +
      // edges + side_channel + cast notes), the latest turn's Q&A,
      // every prior turn, the full investigation board (ladder +
      // story), and any FRESH tentative seeds from this turn's
      // algorithmic seeder.
      const profileBody = ctx.profile.body;
      const profileHooks = ctx.profile.hooks;
      const profileEdges = ctx.profile.edges;
      const profileSideChannel = ctx.profile.side_channel;
      const cast = ctx.profile.cast.map((m) => ({
        label: m.label,
        likely_role: m.likely_role,
        pronouns: m.pronouns,
        color: m.color,
        off_limits: m.off_limits,
        notes: m.notes,
      }));
      // tentative seeds added by the algorithmic seeder THIS turn.
      // We mark them as "fresh" so the observer knows which to walk
      // through first. (Seeds from prior turns are aged via
      // age_in_turns and live in investigation.hypotheses.tentative.)
      const tentativeSeeds = ctx.investigation.hypotheses.tentative.filter(
        (h) => h.age_in_turns === 0 && h.seeded,
      );
      return {
        profile_body: profileBody,
        profile_hooks: profileHooks,
        profile_edges: profileEdges,
        profile_side_channel: profileSideChannel,
        cast,
        this_turn,
        history,
        investigation,
        tentative_seeds: tentativeSeeds,
        instruction:
          'rewrite profile.body integrating this turn\'s evidence. update hooks/edges/side_channel. note any cast members whose role in the subject\'s psychology changed this turn. walk through tentative_seeds AND any older tentative items — emit hypothesis_ladder_moves where evidence supports a rung change. when supporting AND refuting evidence both exist, move to "contested" — the seer hunts there.',
      };
    }
    case 'observer-final': {
      // End-of-survey synthesis pass. The user has answered everything;
      // this is the last shot at the profile body before the Augur sees
      // it and the Seer is born. Different framing than the per-turn
      // observer: we don't care about hypothesis ladder moves (the
      // detective is done), we care about retrospective re-evaluation
      // of Q1-5 (likely curated) and surfacing ## tensions which the
      // seer mines hardest. Hooks + side_channel are now algorithmic;
      // the observer doesn't need to fight over them.
      const cast = ctx.profile.cast.map((m) => ({
        label: m.label,
        likely_role: m.likely_role,
        pronouns: m.pronouns,
        color: m.color,
        off_limits: m.off_limits,
        notes: m.notes,
      }));
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
    case 'detective': {
      // Detective is now the combined investigator + queue editor. It
      // does NOT pick questions (the queue is pre-rolled at survey start
      // with 6 Pillars + 14 random pool draws). What it CAN do is edit
      // upcoming queue items — change options, inject a guess — within
      // a sliding window. Internal node IDs are deliberately hidden;
      // questions appear by text + position only.
      const DETECTIVE_QUEUE_WINDOW = 5;
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
        profile,
        investigation,
        history,
        queue_upcoming: queueWindow,
        detective_log: ctx.detective_log ?? [],
        // current_understanding dropped in v2 — see types.ts. Detective
        // prompt still mentions it (legacy); engine ignores any emitted
        // value. Phase H rewrites prompt + emits StoryObject instead.
        instruction:
          'spend at least half the response in private_thoughts (think out loud). update investigation by CHANGES ONLY. emit queue_edits for any of the upcoming questions (indices 0..N-1) whose options should be personalized; index 0 is the very next question. inject a guess only at hypothesis confidence ≥0.6.',
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
  // Hypothesis ladder: any rung populated → emit the whole ladder so
  // the detective sees the full board. Empty ladder → undefined.
  const ladderTotal =
    i.hypotheses.confirmed.length + i.hypotheses.probable.length +
    i.hypotheses.tentative.length + i.hypotheses.contested.length +
    i.hypotheses.refuted.length + i.hypotheses.held.length;
  // story populated → include it for the detective to extend. Empty
  // story → undefined.
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
