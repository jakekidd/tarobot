// Detective apply — fold a validated DetectiveOutput into the engine's
// Investigation state.
//
// Three updates per call:
//   1. new_hypotheses → add to the ladder at start_at (default tentative)
//   2. hypothesis_ladder_moves → walk existing hypotheses across rungs
//      (via shared.applyLadderMoves)
//   3. story_updates → partial-merge into investigation.story
//
// private_thoughts is not applied here — the engine appends it to
// detective_log directly.

import type { Investigation, DetectiveOutput } from '../../types';
import { applyLadderMoves, removeFromLadder, type Hypothesis, type HypothesisLadder } from '../shared';

export type { DetectiveOutput };

/** Add new hypotheses surfaced by the detective. Each lands on the
 *  ladder at `start_at` (default 'tentative'). Stable id → upsert
 *  semantics: same id already on the board, the new claim replaces
 *  but rung is preserved (via remove-then-add into the new start_at). */
export function addNewHypotheses(
  ladder: HypothesisLadder,
  news: Array<{ id: string; claim: string; start_at?: 'confirmed' | 'probable' | 'tentative' | 'contested' | 'refuted' | 'held' }>,
): HypothesisLadder {
  let next = ladder;
  for (const n of news) {
    const startRung = n.start_at ?? 'tentative';
    const all = [
      ...next.confirmed, ...next.probable, ...next.tentative,
      ...next.contested, ...next.refuted, ...next.held,
    ];
    const existing = all.find((h) => h.id === n.id);
    if (existing) {
      next = removeFromLadder(next, n.id);
      const updated: Hypothesis = { ...existing, description: n.claim };
      next = { ...next, [startRung]: [...next[startRung], updated] };
    } else {
      const fresh: Hypothesis = {
        id: n.id,
        description: n.claim,
        supporting_picks: [],
        contradicting_picks: [],
        confidence: startRung === 'confirmed' ? 0.9 : startRung === 'probable' ? 0.65 : 0.3,
        status: startRung === 'confirmed' ? 'confirmed' : startRung === 'refuted' ? 'refuted' : 'inferred',
        seeded: false,
        generated_at: 0,
        age_in_turns: 0,
      };
      next = { ...next, [startRung]: [...next[startRung], fresh] };
    }
  }
  return next;
}

/** Merge a partial story_updates object into the current story.
 *  fork / present_pressure / past_root / stakes are REPLACED with
 *  the incoming value if provided. hooks are APPENDED + deduped. */
export function mergeStoryUpdates(
  story: NonNullable<Investigation['story']>,
  updates: DetectiveOutput['story_updates'],
): NonNullable<Investigation['story']> {
  const nextHooks = updates.hooks
    ? Array.from(new Set([...story.hooks, ...updates.hooks]))
    : story.hooks;
  return {
    fork: updates.fork ?? story.fork,
    present_pressure: updates.present_pressure ?? story.present_pressure,
    past_root: updates.past_root ?? story.past_root,
    stakes: updates.stakes ?? story.stakes,
    hooks: nextHooks,
  };
}

/** Apply detective output to investigation. v2 detective: produces
 *  new_hypotheses + ladder_moves + story_updates + private_thoughts.
 *  No more legacy hypothesis_updates / refutes / choice_update /
 *  contradictions_found / hooks_found / thread_updates / posture /
 *  current_understanding / queue_edits. */
export function applyDetectiveOutput(inv: Investigation, out: DetectiveOutput): Investigation {
  let hypotheses = inv.hypotheses;
  if (out.new_hypotheses.length > 0) {
    hypotheses = addNewHypotheses(hypotheses, out.new_hypotheses);
  }
  if (out.hypothesis_ladder_moves.length > 0) {
    hypotheses = applyLadderMoves(hypotheses, out.hypothesis_ladder_moves);
  }
  const story = mergeStoryUpdates(inv.story, out.story_updates);
  return {
    ...inv,
    hypotheses,
    story,
  };
}
