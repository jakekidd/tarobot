// Reading types.
//
// The reading phase consumes the survey's CompilerOutput (Profile + Brief
// + Choice) and produces a fan-out, card-flipped portrait of the user-at-
// the-fork. New architecture (replaces the older Plan-and-Write):
//
//   1. INTRO — short monologue establishing presence. Pre-baked for demo
//      (see fixtures.ts); cognition+persona generated in production.
//
//   2. PER-CARD FAN-OUT — at the start of each round (round N = the
//      user is about to flip their Nth card), spawn one cognition+persona
//      pair per still-face-down slot, IN PARALLEL. Each thread treats
//      its slot as the hypothetical-next-flip. None of these threads
//      know the faces of slots they're not assigned. When the user
//      picks a slot, we look up the pre-computed monologue for
//      [round, picked-slot] and deliver it.
//
//   3. CLOSING — after all four flips, one cognition+persona pair
//      synthesizes a structural takeaway across the full revealed arc.
//
// Mirror-not-oracle: cards illuminate the user's RELATIONSHIP to the
// fork, never the answer. Cognition produces understanding; persona
// produces utterance. The split is load-bearing — cognition can route
// to deep-tier cloud Claude; persona can eventually route to local
// uncensored OSS LLMs.

import type { DrawnCards, Profile } from '../types';
import type { CompilerOutput } from '../survey';

// ─── Inputs (from survey close OR demo fixture) ────────────────

export type ReadingInputs = {
  profile: Profile;
  prose_brief: string;
  drawn: DrawnCards;
  /** If set, engine uses this verbatim and skips the intro generation
   *  call. The demo path supplies a hand-written intro. */
  preferred_intro?: Monologue;
};

export function readingInputsFromCompiler(
  compiler: CompilerOutput,
  drawn: DrawnCards,
  opts?: { preferred_intro?: Monologue },
): ReadingInputs {
  return {
    profile: compiler.profile,
    prose_brief: compiler.prose_brief,
    drawn,
    ...(opts?.preferred_intro ? { preferred_intro: opts.preferred_intro } : {}),
  };
}

// ─── Per-card cognition (the clinical layer) ───────────────────

/** Narrative-arc role for a flip. Borrowed from Dramatron's scene labels.
 *  Mapped from flip ORDER (not slot identity), so the same slot might be
 *  'opening' in one reading and 'turning' in another, depending on when
 *  the user chose to flip it. */
export type NarrativeRole = 'opening' | 'rising' | 'turning' | 'closing';

export type ClinicalIntent = {
  position_id: string;             // which slot this clinical is for
  card_id: number;                 // the card face at that slot
  flip_round: number;              // 1..4 — when in the reading this happens
  narrative_role: NarrativeRole;
  /** What THIS card permits about THIS user's RELATIONSHIP to THE fork.
   *  1-2 sentences. Internal — persona will voice it, never quote it. */
  angle: string;
  /** 2-3 specific things to surface about the user, under-specified on
   *  purpose. The persona uses these as material; she doesn't recite. */
  noticings: string[];
  /** ONE mirror-shaped lens, not an outcome prediction. */
  structural_prediction: string;
  /** Pacing, tone, things to leave unsaid, callback opportunities. */
  director_notes: string;
};

// ─── Persona output (the voiced layer) ─────────────────────────

export type Monologue = {
  /** The spoken text. Lowercase voice, mirror register, 2-4 sentences
   *  for beats; 1 short line for intro; 1 sentence for outro. */
  text: string;
  /** Optional invitation for user response. If non-empty, UI may
   *  surface it as a hint above the chat box. */
  prompt_to_user?: string;
};

// ─── Closing ───────────────────────────────────────────────────

export type ClosingIntent = {
  /** ONE-sentence structural takeaway. The frame the user carries
   *  out of the tent. */
  takeaway: string;
  /** Pacing / tone direction for the persona's outro delivery. */
  director_notes: string;
};

// ─── Engine state ──────────────────────────────────────────────

export type ReadingPhase =
  | 'idle'              // not started
  | 'thinking'          // intro generation in flight (only if no preferred_intro)
  | 'intro'             // intro typewriter active
  | 'awaiting_flip'     // user can pick a face-down card or chat
  | 'flipping'          // CSS-3D flip animation playing
  | 'beat_pending'      // monologue not yet ready (fan-out still in flight)
  | 'beat'              // monologue typewriter active
  | 'chat_pending'      // persona generating reply to a user chat message
  | 'closing_thinking'  // cognition + persona running after the 4th flip
  | 'outro'             // closing monologue typewriter active
  | 'done'              // reading complete; chat may still be possible
  | 'error';

export type ChatSpeaker = 'user' | 'seer';

export type ChatMessage = {
  speaker: ChatSpeaker;
  text: string;
};

export type RevealedSlot = {
  position_id: string;
  card_id: number;
  clinical: ClinicalIntent;
  monologue: Monologue;
};

export type ReadingState = {
  inputs: ReadingInputs;
  phase: ReadingPhase;
  intro: Monologue | null;
  outro: Monologue | null;
  revealed: RevealedSlot[];           // in flip order
  /** The slot the user has picked for the current flip (or is being voiced). */
  current_slot: string | null;
  /** Which model tier we're awaiting, for catchphrase selection. null = no wait. */
  awaiting_tier: 'cognition' | 'persona' | null;
  /** Live invitation from the seer for the user to respond. Set when a
   *  delivered Monologue carried a prompt_to_user; cleared when the user
   *  responds (picks a card or sends a chat). */
  active_prompt_to_user: string | null;
  chat: ChatMessage[];
  error?: string;
};

export type ReadingListener = (state: ReadingState) => void;

// ─── Agent I/O (for the call wrappers) ─────────────────────────

export type PerCardCognitionInput = {
  profile: Profile;
  prose_brief: string;
  /** All slots in the spread (with prompt_labels) so the model knows
   *  the structure, but face information is restricted to this_slot +
   *  already-revealed. */
  spread_id: string;
  spread_name: string;
  all_positions: Array<{ id: string; role: string; prompt_label: string }>;
  /** The slot this thread is reading for, including its card face. */
  this_slot: {
    position_id: string;
    role: string;
    prompt_label: string;
    card_id: number;
    card_name: string;
    card_keywords: string[];
    card_upright_meaning: string;
  };
  flip_round: number;
  /** Cards already revealed in this session, with their delivered beats. */
  revealed_history: Array<{
    position_id: string;
    card_name: string;
    beat_text: string;
  }>;
  /** Chat exchanges so far. */
  chat_history: ChatMessage[];
};

export type PerCardPersonaInput = {
  profile: Profile;
  prose_brief: string;
  clinical: ClinicalIntent;
  /** The card face being voiced. */
  card: { name: string; keywords: string[]; upright_meaning: string };
  /** Slot role (e.g. "what surrounds the choice"). */
  slot_label: string;
  revealed_history: Array<{ position_id: string; card_name: string; beat_text: string }>;
  chat_history: ChatMessage[];
};

export type IntroPersonaInput = {
  profile: Profile;
  prose_brief: string;
};

export type ClosingCognitionInput = {
  profile: Profile;
  prose_brief: string;
  revealed: RevealedSlot[];
  chat_history: ChatMessage[];
};

export type ClosingPersonaInput = {
  profile: Profile;
  prose_brief: string;
  revealed: RevealedSlot[];
  chat_history: ChatMessage[];
  closing: ClosingIntent;
};

export type ChatPersonaInput = {
  profile: Profile;
  prose_brief: string;
  revealed: RevealedSlot[];
  chat_history: ChatMessage[];
  user_message: string;
};
