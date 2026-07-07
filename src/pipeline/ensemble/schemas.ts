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

const FeelingSchema = z.object({
  emotion: z.string(),
  toward: z.string().optional(),
  because: z.string(),
});

export const ReadSchema = z.object({
  expressing: z.string(),
  thoughts: z.array(z.string()).max(3),
  feelings: z.array(FeelingSchema).max(3),
  behavior: z.string().optional(),
  cue: z.enum(['press', 'bank', 'honor', 'none']),
  frame_stale: z.boolean(),
});

export const ThoughtsSchema = z.object({
  thoughts: z
    .array(
      z.object({
        thought: z.string(),
        confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        refreshes: z.string().optional(),
      }),
    )
    .min(1)
    .max(3),
});

export const QuestionsSchema = z.object({
  open: z
    .array(z.object({ question: z.string(), refreshes: z.string().optional() }))
    .max(3),
  answered: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .max(5),
});

export const FactsSchema = z.object({
  facts: z
    .array(
      z.object({
        kind: z.enum(['person', 'event', 'state']),
        label: z.string(),
        note: z.string(),
      }),
    )
    .max(8),
});

export const BitSchema = z.object({
  bit: z
    .object({ setup: z.string(), play_when: z.string() })
    .nullable(),
});

export const PredictionSchema = z.object({
  gist: z.string(),
  opening: z.string().optional(),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const VerdictSchema = z.object({
  verdict: z.enum(['hit', 'graze', 'miss']),
});
