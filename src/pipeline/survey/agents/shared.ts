// Shared helpers across the survey-pipeline agents (observer +
// detective). The augur is self-contained and doesn't pull from here.
//
// What lives here vs in a per-agent folder: anything used by BOTH
// observer and detective ends up here. Things that are observer-only
// or detective-only live in that agent's folder.
//
// Notes for the v2 refactor: most of what's in here (LadderRungSchema,
// applyLadderMoves, removeFromLadder, compactInvestigation's
// hypotheses pruning) is slated for deletion in Phase 2 when the
// 6-rung ladder gets ripped out. The split-into-shared.ts is purely a
// surface organization move so the deletion in Phase 2 happens in one
// file instead of being smeared across engine.ts + payload.ts.

import { z } from 'zod';
import type { PipelineContext, Hypothesis, HypothesisLadder } from '../types';

// ─── Zod atoms ─────────────────────────────────────────

/** Ladder rung names. Used by both ObserverOutputSchema and
 *  DetectiveOutputSchema for the hypothesis_ladder_moves field.
 *  Phase 2 removes this along with the ladder itself. */
export const LadderRungSchema = z.enum([
  'confirmed', 'probable', 'tentative', 'contested', 'refuted', 'held',
]);

// ─── Payload compactors ────────────────────────────────

/** Compact a SurveyProfile for the user-message payload. Trims empty
 *  section arrays so we don't ship "noise: []" lines that the model
 *  has to read past. Identity + cast survive raw. */
export function compactProfile(p: PipelineContext['profile']) {
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

/** Compact an Investigation for the user-message payload. Hypothesis
 *  ladder + story emitted only when populated; saves tokens on the
 *  early turns when most of the board is empty. */
export function compactInvestigation(i: PipelineContext['investigation']) {
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

// ─── Ladder operations ─────────────────────────────────

/** Apply a sequence of ladder moves. Each move finds the hypothesis
 *  by id across all rungs, removes it from its current rung, and
 *  pushes it into the target rung. Unknown ids are silently dropped
 *  (the model may have hallucinated). Used by BOTH observer apply
 *  (`out.hypothesis_ladder_moves`) and detective apply. */
export function applyLadderMoves(
  ladder: HypothesisLadder,
  moves: Array<{ id: string; to: 'confirmed' | 'probable' | 'tentative' | 'contested' | 'refuted' | 'held' }>,
): HypothesisLadder {
  if (moves.length === 0) return ladder;
  let next = ladder;
  for (const move of moves) {
    const all = [
      ...next.confirmed, ...next.probable, ...next.tentative,
      ...next.contested, ...next.refuted, ...next.held,
    ];
    const found = all.find((h) => h.id === move.id);
    if (!found) continue;
    next = removeFromLadder(next, move.id);
    next = { ...next, [move.to]: [...next[move.to], found] };
  }
  return next;
}

/** Remove a hypothesis from whichever rung holds it. Idempotent —
 *  passing an unknown id returns the ladder unchanged. */
export function removeFromLadder(ladder: HypothesisLadder, id: string): HypothesisLadder {
  return {
    confirmed: ladder.confirmed.filter((h) => h.id !== id),
    probable: ladder.probable.filter((h) => h.id !== id),
    tentative: ladder.tentative.filter((h) => h.id !== id),
    contested: ladder.contested.filter((h) => h.id !== id),
    refuted: ladder.refuted.filter((h) => h.id !== id),
    held: ladder.held.filter((h) => h.id !== id),
  };
}

// Re-export Hypothesis so per-agent apply files don't need to reach
// back across the boundary for it.
export type { Hypothesis, HypothesisLadder };
