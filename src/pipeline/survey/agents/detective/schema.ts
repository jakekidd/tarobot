// Detective output schema — v2 prose-shell.
//
// The detective is the cognition counterpart to the observer's writer
// role. It READS doc + coverage_map + queue + adversarial candidates
// and emits:
//   - a long-form scratchpad (the model thinks out loud — at least
//     half the response should land here),
//   - a leading_hypothesis (the current best read of the subject —
//     the detective's adversarial TARGET, the thing the next question
//     should try to BREAK),
//   - optional story_updates (partial StoryObject merge),
//   - one next_move (append | revise | conclude).
//
// The leading_hypothesis is load-bearing: it's the thing the
// adversarial selection ranker tries to disconfirm next turn, and
// it's what the assembler renders into observer_body for the Seer's
// director.

import { z } from 'zod';

export const StoryUpdatesSchema = z.object({
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
}).default({});

/** v3 assertion instrument payload — embedded in MoveSchema's
 *  'assertion' branch. Mirrors AssertionInstrument in instruments.ts;
 *  duplicated here as a Zod schema for tool-input validation. */
export const AssertionInstrumentSchema = z.object({
  kind: z.literal('assertion'),
  statement: z.string().min(1),
  predicts_dilemma_id: z.string().min(1),
  comment_if_true: z.string().min(1),
  comment_if_false: z.string().min(1),
  correction_inversions: z.array(z.string()).max(4).optional(),
});

export const MoveSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('append'),
    /** Pool node_id to enqueue. Phase 3+: pool selection only — no
     *  generated questions via this path anymore (instruments replace
     *  the old generation pipeline). */
    node_id: z.string().optional(),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal('revise'),
    /** Phase 4 only — Phase 3 ignores. */
    tail_index: z.number().int().nonnegative(),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal('conclude'),
    reason: z.string(),
  }),
  /** v3 instrument emission. Engine creates a QueueItem with inline +
   *  instrument fields, pushes to tail (during pillars) or head
   *  (post-pillars when queue is empty). */
  z.object({
    kind: z.literal('assertion'),
    instrument: AssertionInstrumentSchema,
    reason: z.string(),
  }),
]);

export const DetectiveOutputSchema = z.object({
  /** The model's long-form reasoning. Half-or-more of the response
   *  lives here. Engine surfaces a recent slice as continuity context
   *  on the next detective call. */
  scratchpad: z.string().default(''),
  /** The detective's CURRENT best read of the subject. The
   *  adversarial selector uses this to score next questions: high
   *  score = high disconfirmation potential. Empty string is valid
   *  (early turns, not enough signal yet). */
  leading_hypothesis: z.string().default(''),
  /** Partial StoryObject merge. fork / present_pressure / past_root /
   *  stakes are REPLACE; hooks are APPEND + dedupe. */
  story_updates: StoryUpdatesSchema,
  /** What to do next. */
  next_move: MoveSchema,
  /** Staleness gate. */
  based_on_v: z.number().int().nonnegative(),
  /** 1-2 sentence summary for engine logs. */
  reasoning: z.string().default(''),
});

export type StoryUpdates = z.infer<typeof StoryUpdatesSchema>;
export type Move = z.infer<typeof MoveSchema>;
export type DetectiveOutput = z.infer<typeof DetectiveOutputSchema>;
