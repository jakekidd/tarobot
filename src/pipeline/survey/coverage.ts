// Coverage map — deterministic recompute over a LivingDoc + picks_log.
//
// The coverage map says PER DIMENSION how confidently the survey has
// placed the subject, where the contention is, and where the gap is.
// It's recomputed after every observer write (and every doc.v bump
// generally), so it always reflects the current doc.
//
// Phase 3 implementation: presence-based heuristic. Dimensions come
// from two sources:
//   1. Authored taxonomy: temporal_lean is always present (load-bearing).
//      Phase 5 adds more authored axes via materials/survey.md.
//   2. Observer-emergent: every key in doc.scaffold.axes becomes a
//      dimension. Confidence is based on entry length (proxy for
//      richness). Contention is detected when held probes contradict
//      a scaffolded axis (Phase 5 sharpens).
//
// This is a starting heuristic — not the calibrated version that
// gates adaptive termination. Phase 5 calibrates the "done" threshold
// against the ≥80% fork-named target. Until then, the engine gates
// the conclude move on the pillar-floor regardless of what coverage
// says (see engine.ts).

import type { CoverageMap, CoverageDim, LivingDoc } from './living-doc';
import type { PickEvent } from './types';

/** Compute a fresh CoverageMap from the current doc + picks_log.
 *  Pure function — no engine state, no LLM. */
export function recomputeCoverage(doc: LivingDoc, picks: readonly PickEvent[]): CoverageMap {
  const out: CoverageMap = {};

  // ── Dimension 1: temporal_lean (always present, even when empty) ──
  out.temporal_lean = scoreTemporalLean(doc);

  // ── Dimension 2+: observer's emergent axes ──
  for (const [axisName, axisContent] of Object.entries(doc.scaffold.axes)) {
    out[axisName] = scoreAxis(axisContent, doc, picks);
  }

  // ── Dimension: fork (the live decision the reading anchors to) ──
  out.fork = scoreFork(doc);

  return out;
}

function scoreTemporalLean(doc: LivingDoc): CoverageDim {
  const lean = doc.scaffold.temporal_lean;
  if (lean === null) {
    return { confidence: 0, contention: 0, gap: 1, sources: [] };
  }
  // Confidence climbs with margin entries that reference the lean
  // (rough heuristic — Phase 5 reads decoder hints to be more precise).
  const supportingMarginCount = doc.margin.filter(
    (m) => m.toLowerCase().includes(lean),
  ).length;
  const confidence = Math.min(1, 0.4 + supportingMarginCount * 0.15);
  return {
    confidence,
    contention: 0,
    gap: 1 - confidence,
    sources: [],
  };
}

function scoreAxis(
  content: string,
  doc: LivingDoc,
  picks: readonly PickEvent[],
): CoverageDim {
  // Confidence proxy: content length, capped. An observer-axis with
  // ≥120 chars of integrated observation is ~well-formed.
  const len = content.trim().length;
  const confidence = Math.min(1, len / 120);
  // Contention proxy: count held probes whose claim shares a token
  // with this axis (very rough — Phase 5 ties to authored decoder).
  const tokens = new Set(content.toLowerCase().split(/\W+/).filter((t) => t.length > 4));
  const contendingHeld = doc.held.filter((p) => {
    const probeTokens = p.claim.toLowerCase().split(/\W+/);
    return probeTokens.some((t) => tokens.has(t));
  });
  const contention = Math.min(1, contendingHeld.length * 0.25);
  // Sources: pick.node_ids whose answer text appears in the content
  // (very rough; Phase 5 wires source attribution explicitly).
  const sources = picks
    .filter((p) => {
      const ans = typeof p.answer === 'string' ? p.answer : p.answer.join(' ');
      return ans.length > 0 && content.toLowerCase().includes(ans.toLowerCase());
    })
    .map((p) => p.node_id);
  return {
    confidence,
    contention,
    gap: Math.max(0, 1 - confidence),
    sources,
  };
}

function scoreFork(doc: LivingDoc): CoverageDim {
  const fork = doc.scaffold.fork;
  if (!fork) {
    return { confidence: 0, contention: 0, gap: 1, sources: [] };
  }
  // Stasis-as-fork counts as half-confident (the detective constructed
  // it from an avoidance pattern rather than a stated decision).
  const baseConfidence = fork.is_stasis ? 0.5 : 0.7;
  // Bonus for present_pressure + past_root being non-null (the story
  // around the fork is filled in).
  let bonus = 0;
  if (doc.story.present_pressure) bonus += 0.1;
  if (doc.story.past_root) bonus += 0.1;
  if (doc.story.stakes) bonus += 0.1;
  const confidence = Math.min(1, baseConfidence + bonus);
  return {
    confidence,
    contention: 0,
    gap: Math.max(0, 1 - confidence),
    sources: [],
  };
}

/** "Done" predicate over a coverage map. Returns true when the
 *  reading has enough placement to land the Seer's diamond well.
 *  Phase 5 calibrates the threshold against the ≥80% fork-named
 *  target across walkthroughs.
 *
 *  Engine MUST also gate on the pillar floor (picks_log post-opener
 *  count ≥ getPillars().length) regardless of what this returns. */
export function isCoverageDone(map: CoverageMap): boolean {
  if ((map.fork?.confidence ?? 0) < 0.6) return false;
  if ((map.temporal_lean?.confidence ?? 0) < 0.5) return false;
  // Need at least 2 axes with confidence ≥ 0.6 to call it "rich".
  let richAxes = 0;
  for (const [name, dim] of Object.entries(map)) {
    if (name === 'fork' || name === 'temporal_lean') continue;
    if (dim.confidence >= 0.6) richAxes += 1;
  }
  return richAxes >= 2;
}
