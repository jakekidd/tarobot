// Zod at the adapter boundary — the schema IS the contract. Freeform
// markdown payloads (the frame) have no schema on purpose.

import { z } from 'zod';
import { BEAT_TYPES, DILEMMA_CLASSES, QUESTION_FRAMES } from './beats';

export const IntentSchema = z.object({
  beat: z.enum(BEAT_TYPES),
  frame: z.enum(QUESTION_FRAMES).optional(),
  target: z.string().optional(),
  variant: z.enum(['primary', 'fallback', 'escape']).optional(),
  accomplish: z.string(),
  ammo: z.string().optional(),
  approx_words: z.number().int().min(0).max(120),
  note: z.string(),
});

export const PersonaLineSchema = z.object({
  too_safe: z.string(),
  too_far: z.string(),
  spoken: z.string(),
});

/** T-mode fills: slot key → text. tolerant on shape, validated hard
 *  by beats.validateFills afterwards. */
export const SlotFillsSchema = z.object({
  fills: z.record(z.string(), z.string()).default({}),
});

const FeelingSchema = z.object({
  emotion: z.string(),
  toward: z.string().optional(),
  because: z.string(),
});

export const ReadSchema = z.object({
  expressing: z.string(),
  // small models occasionally emit the array as one string blob; a lone
  // string degrades to a single thought instead of failing the read
  thoughts: z.preprocess(
    (v) => (typeof v === 'string' ? [v] : v),
    z.array(z.string()).max(3),
  ),
  feelings: z.array(FeelingSchema).max(3),
  behavior: z.string().optional(),
  cue: z.enum(['press', 'bank', 'honor', 'none']),
  coherence: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  frame_stale: z.boolean(),
});

// tolerant on purpose: missing fields mean "nothing new this cycle"
export const ProfileFilingSchema = z.object({
  updates: z
    .array(z.object({ facet: z.string(), answer: z.string() }))
    .max(6)
    .default([]),
  elevate: z
    .array(z.object({ facet: z.string(), angle: z.string() }))
    .max(2)
    .default([]),
});

export const ConjectorFilingSchema = z.object({
  prev: z.enum(['cold', 'warm', 'hot', 'unplayed']).optional(),
  guess: z.string().optional(),
  alt_guess: z.string().optional(),
  /** classify: the dilemma class locks the spread request */
  class: z.enum(DILEMMA_CLASSES).optional(),
  /** the DIVINER's cheat — one deck-bible card id worth planting */
  plant: z.string().optional(),
  problem_md: z.string().optional(),
  options_md: z.string().optional(),
  quest_md: z.string().optional(),
});
