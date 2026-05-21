// Algorithmic probe seeder.
//
// Reads the `Inversions:` block of a question's probe and emits
// deterministic Probe seeds based on the user's answer. Seeds land
// on `doc.held[]` before the observer fires, so the observer (single
// writer of doc, with explicit speculation authority) sees them as
// candidates to elevate (move to scaffold.leading_hypothesis / axes)
// or refute (clear from held).
//
// No LLM call — pure parser + matcher. Bypasses the model's
// natural cautiousness ("I don't want to make wild assumptions")
// by encoding the inversion rules in the markdown the author wrote.
//
// v2 (Phase 2): emits `Probe` (from living-doc.ts) instead of the
// 9-field legacy `Hypothesis`. The signal is the claim; the rest of
// the ladder bookkeeping is gone.
//
// Inversion text follows one of three loose formats — the parser
// handles all three by splitting on `.` AND `;` and matching
// `option = claim` or `option → claim`:
//
//   value_most:  "love → fear of being unlovable; freedom → fear of constraint; ..."
//   decision_style: "mind = deliberate / analytic — may intellectualize feeling. heart = ... gut = ..."
//   9-fork: "bet = there's a leap they keep not taking; hold = ... . stay = ..."
//
// For fork answers encoded as "between:left/right", BOTH sides'
// seeds are emitted PLUS a generic stuck-between claim.

import type { TreeNode } from './types';
import type { Probe } from './living-doc';

/** Public entry. Generate seeds for one Q&A pair. Returns 0..N
 *  Probe objects, each ready to push to doc.held[]. */
export function generateSeeds(
  node: TreeNode,
  answer: string | string[],
  turn_n: number,
  source_pick_node_id: string,
): Probe[] {
  const inversions = node.probe?.inversions;
  if (!inversions) return [];
  const answerStr = Array.isArray(answer) ? answer.join(' ') : answer;
  const claims = parseInversionMatches(inversions, answerStr);
  return claims.map((claim, i) => buildSeed(claim, turn_n, source_pick_node_id, i));
}

/** Parse the inversion text and return claim strings that match the
 *  user's answer. Exposed for testing / debugging. */
export function parseInversionMatches(inversionsText: string, answer: string): string[] {
  const lowerAnswer = answer.toLowerCase().trim();
  if (!lowerAnswer) return [];

  // Fork "between:left/right" — match BOTH sides + stuck claim.
  if (lowerAnswer.startsWith('between:')) {
    const both = lowerAnswer.slice('between:'.length);
    const parts = both.split('/').map((s) => s.trim()).filter(Boolean);
    const seeds: string[] = [];
    for (const side of parts) {
      seeds.push(...matchSingleAnswer(inversionsText, side));
    }
    if (parts.length === 2) {
      seeds.push(`subject is stuck on the ${parts[0]}/${parts[1]} fork — both poles are live but unresolved`);
    }
    return dedupe(seeds);
  }

  return matchSingleAnswer(inversionsText, lowerAnswer);
}

/** Match a single answer term against the inversion text. */
function matchSingleAnswer(inversionsText: string, lowerAnswer: string): string[] {
  // Split on '.' or ';' followed by whitespace. Either is treated as
  // a chunk separator. Discard leading-prose chunks that don't have
  // a `=` or `→` mapping.
  const chunks = inversionsText.split(/[.;]\s+/);
  const seeds: string[] = [];
  for (const chunk of chunks) {
    // Look for `option = claim` or `option → claim` (also `->`).
    const match = chunk.match(/^(.+?)\s*(?:=|→|->)\s*(.+)$/);
    if (!match) continue;
    const optionPart = match[1]!.trim().toLowerCase();
    const claim = trimTrailingPunctuation(match[2]!.trim());
    // Match: option string's LAST word is usually the actual option
    // label; some lines have a preamble like "strong values invert to
    // corresponding fears — love → ...". Test against last word AND
    // direct equality / substring at the end.
    if (
      optionPart === lowerAnswer ||
      optionPart.endsWith(lowerAnswer) ||
      lastToken(optionPart) === lowerAnswer
    ) {
      seeds.push(claim);
    }
  }
  return seeds;
}

/** Strip trailing sentence-end punctuation (`.`, `;`, `!`, `?`) so
 *  claims read cleanly when embedded in the detective's prose. The
 *  inversion text often ends a chunk with a period — the parser's
 *  split-on-[.;]\s+ doesn't strip the terminal period because it
 *  isn't followed by whitespace. */
function trimTrailingPunctuation(s: string): string {
  return s.replace(/[.;!?]+$/, '').trim();
}

function lastToken(s: string): string {
  const tokens = s.split(/[\s—–—–]+/).filter(Boolean);
  return tokens[tokens.length - 1] ?? '';
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

function buildSeed(
  claim: string,
  turn_n: number,
  source_pick_node_id: string,
  idx: number,
): Probe {
  // Stable id based on source + claim text — same Q+claim seeded
  // twice in a session collides to the same id (upsert behavior).
  const id = `seed-${source_pick_node_id}-${idx}-${hashShort(claim)}`;
  return {
    id,
    claim,
    source: 'seeder',
    born_turn: turn_n,
    age_in_turns: 0,
  };
}

/** Tiny deterministic hash so seed ids are short + collision-resistant
 *  for ~30 seeds per session. Not cryptographic. */
function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}

/** Age all held probes by 1 turn. Engine calls this on every
 *  post-opener pick before generating new seeds. Returns a
 *  shallow-copied array so the engine state mutation stays clean. */
export function ageHeldProbes(held: Probe[]): Probe[] {
  return held.map((p) => ({ ...p, age_in_turns: (p.age_in_turns ?? 0) + 1 }));
}

// (Legacy ageLadderTentativeAndHeld removed — the 6-rung ladder is
// gone in v2. The new "held" lives at doc.held and is a flat list
// of Probes; ageing is the same operation.)
