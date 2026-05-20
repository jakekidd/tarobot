// Runtime schemas for agent I/O. Every Observer / Detective /
// Interrogator / Compiler response is validated through these at the
// adapter boundary. Malformed model output throws a typed error; the
// engine catches and falls back.

import { z } from 'zod';

// ─── shared atoms ───────────────────────────────────────

// v2 zod atoms. Legacy NoteCategory / ProfileSectionKey / CastMember /
// ChoiceShape / Hypothesis / Contradiction / Hook Zod schemas dropped
// with the v2 refactor — they belonged to the legacy ObserverOutput
// (notes_to_append) and DetectiveOutput (hypothesis_updates,
// choice_update, contradictions_found, hooks_found) shapes. The
// observer is now a profile.body rewriter and the detective produces
// StoryObject + ladder moves.

// ─── Observer ───────────────────────────────────────────
// v2: observer is a psychological profiler with explicit speculation
// authority. Returns a FULL rewrite of profile.body markdown each
// turn, plus updated hooks/edges/side_channel arrays, cast notes,
// and hypothesis ladder moves.

const LadderRung = z.enum(['confirmed', 'probable', 'tentative', 'contested', 'refuted', 'held']);

export const ObserverOutputSchema = z.object({
  profile_body: z.string(),
  hooks: z.array(z.string()),
  edges: z.array(z.string()),
  side_channel: z.object({
    signals: z.string().optional(),
    patterns: z.string().optional(),
    contradictions: z.string().optional(),
    avoidances: z.string().optional(),
  }),
  cast_notes_updates: z.array(z.object({
    label: z.string(),
    notes: z.string(),
  })),
  hypothesis_ladder_moves: z.array(z.object({
    id: z.string(),
    to: LadderRung,
  })),
  reasoning: z.string(),
});

// ─── Detective (v2) ────────────────────────────────────
// The detective collaborates with the observer on the hypothesis
// ladder AND owns the StoryObject (the narrative spine the seer
// reads). private_thoughts is the model's scratchpad (≥half of the
// response), persisted to detective_log and fed back next call.
// queue_edits and current_understanding are gone (replaced by
// observer's ladder authority + story).

export const DetectiveOutputSchema = z.object({
  new_hypotheses: z.array(z.object({
    id: z.string(),
    claim: z.string(),
    start_at: LadderRung.optional(),
  })),
  hypothesis_ladder_moves: z.array(z.object({
    id: z.string(),
    to: LadderRung,
  })),
  story_updates: z.object({
    fork: z.object({
      a: z.string(),
      b: z.string(),
      is_stasis: z.boolean(),
    }).optional(),
    present_pressure: z.string().optional(),
    past_root: z.string().optional(),
    stakes: z.object({
      on_a: z.string(),
      on_b: z.string(),
    }).optional(),
    hooks: z.array(z.string()).optional(),
  }),
  private_thoughts: z.string(),
  reasoning: z.string(),
});

// ─── Compiler (removed) ─────────────────────────────────
// The compiler stage was dropped in favor of handing off a Seer
// instance directly. The Seer's intro pipeline (cognition → persona)
// runs in its constructor; survey hands off via getSeer() instead of
// producing an intermediate CompilerOutput object.
