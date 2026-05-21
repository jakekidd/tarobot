// Adversarial pool selection — deterministic helper that ranks
// available pool questions by their potential to disconfirm the
// detective's current leading_hypothesis.
//
// Used by the detective payload builder: given the current doc + the
// pool of unanswered questions, score each candidate and surface the
// top-N to the detective with a "why" rationale. The detective then
// picks one as its next_move.append.node_id.
//
// Phase 3 scoring is simple — token overlap between the question's
// probe and the leading_hypothesis, weighted by the coverage gap on
// the question's topic. Phase 5 wires decoder hints (`seed:` /
// `drill:` per option) to make info-gain concrete: which question
// addresses which dimension.

import type { CoverageMap, LivingDoc } from './living-doc';
import type { TreeNode } from './types';
import { getNode } from './tree';

export type AdversarialCandidate = {
  node_id: string;
  question_text: string;
  score: number;
  /** Why this candidate ranked where it did — human-readable for
   *  the detective's payload + the debug panel. */
  rationale: string;
};

export type AdversarialInput = {
  doc: LivingDoc;
  coverage: CoverageMap;
  /** Pool node ids the user HASN'T answered yet (asked_node_ids
   *  filtered out, plus prior_answered_node_ids for returning users). */
  availableNodeIds: readonly string[];
  /** Max candidates to return. Top-N by score. */
  limit?: number;
};

const DEFAULT_LIMIT = 5;

/** Rank available pool questions by adversarial potential against
 *  the current leading_hypothesis. Top-N candidates returned with
 *  rationale. */
export function rankAdversarial(input: AdversarialInput): AdversarialCandidate[] {
  const lead = input.doc.scaffold.leading_hypothesis.trim().toLowerCase();
  const limit = input.limit ?? DEFAULT_LIMIT;

  // Score each available node.
  const scored = input.availableNodeIds.flatMap((id) => {
    const node = getNode(id);
    if (!node) return [];
    const score = scoreNode(node, lead, input.coverage);
    return [{ node_id: id, question_text: node.q, score: score.value, rationale: score.rationale }];
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function scoreNode(
  node: TreeNode,
  leadingLower: string,
  coverage: CoverageMap,
): { value: number; rationale: string } {
  const probeText = [
    node.probe?.surface ?? '',
    node.probe?.inversions ?? '',
    node.probe?.watch_for ?? '',
  ].join(' ').toLowerCase();

  // Token overlap with leading_hypothesis: probe text that mentions
  // words from the leading hypothesis is more likely to test it.
  let overlapScore = 0;
  const reasons: string[] = [];
  if (leadingLower.length > 0) {
    const leadingTokens = new Set(
      leadingLower.split(/\W+/).filter((t) => t.length > 4),
    );
    const probeTokens = probeText.split(/\W+/);
    let hits = 0;
    for (const t of probeTokens) {
      if (leadingTokens.has(t)) hits += 1;
    }
    overlapScore = Math.min(1, hits * 0.2);
    if (hits > 0) reasons.push(`${hits} token(s) match leading_hypothesis`);
  }

  // Coverage gap on the topic axis: if the dimension this question
  // addresses has high gap, it's worth asking. Phase 5 wires the
  // explicit mapping via authored decoder hints; for now we use
  // node.topic as a rough proxy for axis name.
  const dimByTopic = coverage[node.topic];
  const gapScore = dimByTopic?.gap ?? 0.5;
  if (gapScore > 0.6) reasons.push(`topic '${node.topic}' has gap ${gapScore.toFixed(2)}`);

  // Contention bonus: if the topic dim has both supporting AND
  // refuting evidence, the next question on it is hot.
  const contentionScore = dimByTopic?.contention ?? 0;
  if (contentionScore > 0.3) reasons.push(`topic '${node.topic}' is contested`);

  // Weighted sum. Tuned by feel — Phase 5 will calibrate against
  // walkthrough data.
  const value = overlapScore * 0.5 + gapScore * 0.3 + contentionScore * 0.2;
  const rationale = reasons.length > 0
    ? reasons.join(' · ')
    : 'no strong signal — neutral pick';
  return { value, rationale };
}
