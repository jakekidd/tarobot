// Survey engine v2 core types — the LivingDoc that the observer writes
// and the detective reads. Replaces the legacy Investigation type
// (HypothesisLadder + StoryObject + Choice + Hooks + ActiveThreads).
//
// Design principles:
// - Single writer. The observer is the only agent that mutates `doc`.
//   Detective reads `doc` + `coverage` + queue, emits a Move; the
//   engine applies the Move (which may bump doc.v) — but the
//   document is observer-owned.
// - Delta-on-scaffold. The scaffold has a fixed shape (axes,
//   cast_notes, fork, tells, temporal_lean). Observer emits delta
//   patches; full rewrites are gone (kills O(turn²) token cost).
// - Bounded margin. Append-mostly list of high-variance observations
//   capped at MARGIN_CAP entries (oldest-evict). This is where the
//   model gets to be unconstrained.
// - Staleness gate. Every doc write bumps `doc.v`. Agent calls carry
//   `based_on_v` so a stale agent result discards cleanly.
// - story + held survive Investigation's death. story remains the
//   narrative spine the Seer reads. held is surfaced to Augur and
//   Seer at survey close.

import type { StoryObject } from './types';

/** A probe is a hypothesis the survey couldn't resolve. Seeder drops
 *  them in from question-level Inversions; observer can elevate
 *  (move to scaffold.axes / leading_hypothesis); detective can refute
 *  or restate. Anything still here at survey close is surfaced to the
 *  Seer as a "risky probe to swing for" via the closing director.
 *  Older = more durable = more diagnostically interesting. */
export type Probe = {
  id: string;
  claim: string;
  source: 'seeder' | 'observer' | 'detective';
  born_turn: number;
  /** Engine bumps this each turn the probe stays in held without
   *  being elevated or refuted. */
  age_in_turns: number;
};

/** Per-dimension coverage state. Driven by both authored decoder
 *  hints (Phase 5) and the observer's writes. Coverage is recomputed
 *  deterministically after every observer apply, so it's always
 *  consistent with the current doc. */
export type CoverageDim = {
  /** 0..1 — how confidently we've placed this dimension. */
  confidence: number;
  /** 0..1 — supporting AND refuting evidence both present. Hot. */
  contention: number;
  /** 0..1 — how much we're missing. 1 - confidence approximately. */
  gap: number;
  /** Node ids whose answers contributed to this dimension's reads. */
  sources: string[];
};

/** Coverage map — dimension id → state. Dimensions are dynamic, but
 *  one is special: `temporal_lean` is always present (past / present /
 *  future / null), since it rotates the whole reading's stance. */
export type CoverageMap = Record<string, CoverageDim>;

/** The temporal stance the reading takes on the user's fork.
 *  past   — fork is already behind them, unmetabolized; regret /
 *           road not taken / loop they keep re-litigating
 *  present — fork is now but they're living it as stasis
 *  future  — fork is ahead, nameable, has a clock
 *  null    — not yet inferred with confidence */
export type TemporalLean = 'past' | 'present' | 'future' | null;

/** The structured part of the LivingDoc. Observer delta-edits; engine
 *  applies patches. Replaces profile.body's 7KB-per-turn rewrite. */
export type DocScaffold = {
  /** The detective's current best read. Adversarial target — the
   *  next-question selection is biased toward disconfirming this. */
  leading_hypothesis: string;
  /** Observer-chosen labels → freeform per-axis observations. Lets
   *  the observer name its own buckets without forcing a fixed
   *  taxonomy. Phase 5 may introduce authored axes alongside. */
  axes: Record<string, string>;
  /** Per-cast-member psychological commentary, keyed by CastMember.label. */
  cast_notes: Record<string, string>;
  /** Mirrors story.fork — duplicated for fast scaffold-only access. */
  fork: StoryObject['fork'];
  /** Latency / hesitation / hover-then-tap flags. Append-mostly,
   *  capped at TELLS_CAP. */
  tells: string[];
  /** Inferred temporal stance. Becomes a named coverage dimension. */
  temporal_lean: TemporalLean;
};

/** Append-mostly cap for the fluid margin. Older entries evict first.
 *  Tuned to keep observer payloads small without losing recent texture. */
export const MARGIN_CAP = 16;
/** Cap for scaffold.tells — keeps the latency flag list bounded. */
export const TELLS_CAP = 12;

/** The LivingDoc — single source of truth for what the survey has
 *  understood about the subject. Owned by the observer (sole writer).
 *  Detective reads + emits Moves; engine applies them. */
export type LivingDoc = {
  /** Monotonic version counter. Every write bumps it: seeder,
   *  observer apply, coverage recompute, detective apply (if move
   *  mutates doc). based_on_v staleness gate uses this. */
  v: number;
  scaffold: DocScaffold;
  /** Append-mostly high-variance observations. Capped at MARGIN_CAP,
   *  oldest-evict. Observer sees the most recent N when computing
   *  the next delta. */
  margin: string[];
  /** The narrative cross-section. Preserved from legacy Investigation
   *  because Augur + Seer + director read it. Detective writes it via
   *  story_updates in its Move (kind='append' or 'revise' or
   *  'conclude' carry optional story_updates). */
  story: StoryObject;
  /** Probes still unresolved at the moment. Surfaced to Seer at
   *  survey close (oldest-first sort). */
  held: Probe[];
  /** Per-dimension confidence / contention / gap. Recomputed
   *  deterministically after each observer apply. */
  coverage: CoverageMap;
};

/** The fresh LivingDoc constant. Used for engine init + reset. */
export const EMPTY_DOC: LivingDoc = {
  v: 0,
  scaffold: {
    leading_hypothesis: '',
    axes: {},
    cast_notes: {},
    fork: null,
    tells: [],
    temporal_lean: null,
  },
  margin: [],
  story: {
    fork: null,
    present_pressure: null,
    past_root: null,
    stakes: null,
    hooks: [],
  },
  held: [],
  coverage: {},
};

/** Detective's next move. Each call emits exactly one. */
export type Move =
  /** Append a new question to the queue tail. In Phase 3 carries a
   *  pool node_id (deterministic pool selection). In Phase 4 carries
   *  an intent + planted_options for the generation pipeline. */
  | {
      kind: 'append';
      node_id?: string;
      intent?: { angle: string; planted_options?: string[] };
      reason: string;
    }
  /** Revise a buffered tail question in light of the new evidence.
   *  Phase 4 only — Phase 3 doesn't yet have a tail to revise. */
  | {
      kind: 'revise';
      tail_index: number;
      new_intent: { angle: string; planted_options?: string[] };
      reason: string;
    }
  /** End the survey. Engine MUST gate this on the pillar floor
   *  (`picks_log.filter(post-opener).length >= getPillars().length`).
   *  Coverage "done" heuristic isn't calibrated until Phase 5. */
  | { kind: 'conclude'; reason: string };

/** Queue zones. `head` is committed (the next question + any past it
 *  that pillars guarantee). `tail` is detective-revisable (the
 *  buffered freeform questions the rolling-queue refills). */
export type QueueZone<T> = {
  head: T[];
  tail: T[];
};
