// Zod at the adapter boundary — the schema IS the contract. Freeform
// markdown payloads (the frame) have no schema on purpose (principle 8).

import { z } from 'zod';
import { ENSEMBLE_MOVES, STALL_KINDS } from './types';

export const IntentSchema = z.object({
  move: z.enum(ENSEMBLE_MOVES),
  thread: z.string(),
  accomplish: z.string(),
  ammo: z.string().optional(),
  approx_words: z.number().int().min(0).max(120),
  note: z.string(),
  stall_kind: z.enum(STALL_KINDS).optional(),
});

export const PersonaLineSchema = z.object({
  too_safe: z.string(),
  too_far: z.string(),
  spoken: z.string(),
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
  frame_stale: z.boolean(),
});

export const FactsSchema = z.object({
  // tolerant on purpose: a missing field means "nothing new", and an
  // over-eager model restating its ledger dedupes at merge — a failed
  // call loses strictly more than a long list does
  facts: z
    .array(
      z.object({
        kind: z.enum(['person', 'event', 'state']),
        label: z.string(),
        note: z.string(),
      }),
    )
    .max(20)
    .default([]),
});

