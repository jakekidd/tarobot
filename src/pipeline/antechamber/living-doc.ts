// Antechamber engine v2 core types — the LivingDoc that the observer writes
// and the diviner reads. Replaces the legacy Investigation type
// (HypothesisLadder + StoryObject + Choice + Hooks + ActiveThreads).
//
// Design principles:
// - Single writer. The observer is the only agent that mutates `doc`.
//   Diviner reads `doc` + `coverage` + queue, emits a Move; the
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
//   Seer at antechamber close.

import type { StoryObject } from './types';

/** v3.2: a probe is a hypothesis the antechamber is tracking. The profiler
 *  is the curator of the hypothesis list (doc.held). Seeder drops fresh
 *  candidates from question-level Inversions; diviner probes them via
 *  guesses; profiler reads the guess outcomes + history + verbatim
 *  log and edits the list (promote / refute / refine / drop / merge).
 *  The compiler (close-pass agent) reads the final list to identify the
 *  Dilemma and write the prose anchor.
 *
 *  Status semantics (v3.2 upgrade — pre-3.2 Probes had no status field
 *  and lived purely in `held`, with refute = drop): */
export type ProbeStatus =
  /** seeded by the algorithmic Inversions seeder; not yet tested. */
  | 'untested'
  /** the diviner has emitted (or queued) an guess against this. */
  | 'probing'
  /** an guess outcome confirmed it. high signal for the compiler. */
  | 'confirmed'
  /** the user typed a correction that refined this — the current
   *  `claim` reflects the corrected version. highest-signal status:
   *  the user supplied the contour themselves. */
  | 'refined_by_correction'
  /** an guess outcome refuted it. kept around (with this status)
   *  so the compiler can avoid re-asserting the same dead branch. */
  | 'refuted'
  /** profiler explicitly dropped — superseded by a sharper hypothesis
   *  or no longer worth tracking. removed from the list on next
   *  apply (status exists only for the transient "just dropped" event
   *  surfaced to the debug bus). */
  | 'dropped';

export type Probe = {
  id: string;
  claim: string;
  source: 'seeder' | 'observer' | 'diviner' | 'profiler';
  /** v3.2 status. Defaults to 'untested' on seeder-created probes for
   *  back-compat with pre-3.2 records. */
  status?: ProbeStatus;
  /** 0..1 — profiler's confidence in this hypothesis. Optional;
   *  hedge-language in the claim itself carries the same signal less
   *  precisely. */
  confidence?: number;
  /** Index references into PickEvent[] (and/or VerbatimEntry[]) that
   *  support / refute this hypothesis. Lets the compiler trace which
   *  evidence drove which read. Format: 'pick:3' / 'verbatim:7'. */
  evidence_refs?: string[];
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
  /** The diviner's current best read. Adversarial target — the
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

/** The LivingDoc — single source of truth for what the antechamber has
 *  understood about the subject. Owned by the observer (sole writer).
 *  Diviner reads + emits Moves; engine applies them. */
export type LivingDoc = {
  /** Monotonic version counter. Every write bumps it: seeder,
   *  observer apply, coverage recompute, diviner apply (if move
   *  mutates doc). based_on_v staleness gate uses this. */
  v: number;
  scaffold: DocScaffold;
  /** Append-mostly high-variance observations. Capped at MARGIN_CAP,
   *  oldest-evict. Observer sees the most recent N when computing
   *  the next delta. */
  margin: string[];
  /** The narrative cross-section. Preserved from legacy Investigation
   *  because Augur + Seer + director read it. Diviner writes it via
   *  story_updates in its Move (kind='append' or 'revise' or
   *  'conclude' carry optional story_updates). */
  story: StoryObject;
  /** Probes still unresolved at the moment. Surfaced to Seer at
   *  antechamber close (oldest-first sort). */
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

/** Diviner's next move. Each call emits exactly one. */
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
  /** End the antechamber. Engine MUST gate this on the pillar floor
   *  (`picks_log.filter(post-opener).length >= getPillars().length`).
   *  Coverage "done" heuristic isn't calibrated until Phase 5. */
  | { kind: 'conclude'; reason: string };

/** Queue zones. `head` is committed (the next question + any past it
 *  that pillars guarantee). `tail` is diviner-revisable (the
 *  buffered freeform questions the rolling-queue refills). */
export type QueueZone<T> = {
  head: T[];
  tail: T[];
};
