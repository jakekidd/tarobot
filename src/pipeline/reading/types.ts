// Reading types.
//
// The reading phase consumes the survey's CompilerOutput (Profile + Brief
// + Choice) and produces a sequenced, card-flipped portrait of the user-
// at-the-fork. Plan-and-Write architecture:
//
//   1. COGNITION (one call) — given brief + drawn cards, produce a
//      ReadingPlan: a 1-sentence arc thesis + per-card structural angles.
//      "What angle does this card permit me to illuminate?" — NOT outcome
//      predictions. Mirror-not-oracle: each angle illuminates the user's
//      position at the fork, not the fork's answer.
//
//   2. PERSONA (one call) — given the plan + voice rules + brief, produce
//      a Reading: the witch's intro line + one beat per card + optional
//      closing line. Under-specify on purpose; co-authorship with the user.
//
// The UI then sequences the card flips and renders the beats one at a time.
// No mid-reading LLM calls; latency lives at the pre-reading boundary, not
// between flips.

import type { DrawnCards, Profile } from '../types';
import type { CompilerOutput } from '../survey';

// ─── Inputs (from survey close + card draw) ────────────────────

export type ReadingInputs = {
  profile: Profile;             // legacy shape from CompilerOutput
  prose_brief: string;          // the witch's primary read
  drawn: DrawnCards;            // cards already selected + assigned positions
};

export function readingInputsFromCompiler(
  compiler: CompilerOutput,
  drawn: DrawnCards,
): ReadingInputs {
  return {
    profile: compiler.profile,
    prose_brief: compiler.prose_brief,
    drawn,
  };
}

// ─── Cognition output (the plan) ───────────────────────────────

/** Narrative-arc role for a card position. Borrowed from Dramatron's
 *  scene-label pattern; gives the persona structural scaffolding. */
export type NarrativeRole = 'opening' | 'rising' | 'turning' | 'closing';

export type CardAngle = {
  /** The spread position id (from src/pipeline/spreads.ts). */
  position_id: string;
  /** The drawn card's id (0-77). */
  card_id: number;
  /** Structural intent — what THIS card permits the witch to illuminate
   *  about THIS user's position at THE fork. 1-2 sentences. Internal,
   *  not user-facing. */
  angle: string;
  /** The card's symbolic constraint, named explicitly so the persona
   *  can lean on it. 1 sentence. */
  constraint: string;
  /** Narrative scaffolding for the witch's pacing. */
  narrative_role: NarrativeRole;
};

export type ReadingPlan = {
  /** One-sentence thesis for the whole reading. The structural shape of
   *  the user-at-fork that all four cards together illuminate. */
  arc_thesis: string;
  /** Per-card structural angles, in flip order. */
  cards: CardAngle[];
};

// ─── Persona output (the voice) ────────────────────────────────

export type Beat = {
  /** Matches one CardAngle by position_id. */
  position_id: string;
  /** The witch's spoken beat for this card. 2-4 sentences, mirror-not-
   *  oracle, specific-but-under-determined. */
  text: string;
};

export type Reading = {
  /** The witch's opening line, before any cards flip. */
  intro: string;
  /** One beat per card position, in flip order. */
  beats: Beat[];
  /** Optional closing line after the last flip. Empty allowed. */
  outro: string;
};

// ─── Engine state (UI-facing) ──────────────────────────────────

export type ReadingPhase =
  | 'idle'           // not yet started
  | 'thinking'       // cognition + persona in flight
  | 'intro'          // intro line typing out
  | 'flipping'       // a card is flipping
  | 'beat'           // a beat is being voiced
  | 'between'        // brief pause between cards
  | 'outro'          // outro line typing out
  | 'done';

export type ReadingState = {
  inputs: ReadingInputs;
  plan: ReadingPlan | null;
  reading: Reading | null;
  phase: ReadingPhase;
  /** Which card index we're currently on (0..3 for four-card-diamond).
   *  -1 means before the first card. */
  current_index: number;
  /** Position ids that have been flipped + voiced. */
  revealed_position_ids: string[];
  closed: boolean;
  error?: string;
};

// ─── Agent I/O ─────────────────────────────────────────────────

export type CognitionInput = {
  profile: Profile;
  prose_brief: string;
  drawn: DrawnCards;
};

export type CognitionOutput = ReadingPlan;

export type PersonaInput = {
  profile: Profile;
  prose_brief: string;
  drawn: DrawnCards;
  plan: ReadingPlan;
};

export type PersonaOutput = Reading;

export type ReadingListener = (state: ReadingState) => void;
