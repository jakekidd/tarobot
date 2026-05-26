// Seeder output schema — Haiku, per-turn, free-form notes.
//
// Replaces the v3.2 Profiler hypothesis curator. Plain text lines, no
// status flags, no structure. The detective reads the accumulated note
// list and decides which threads to pull. Append-only — Seeder never
// edits or drops previously-emitted notes.

import { z } from 'zod';

export const SeederOutputSchema = z.object({
  /** Free-form notes this turn. One observation per entry. Plain text,
   *  short. Empty array is valid (silence beats noise on thin turns). */
  notes: z.array(z.string().min(1)).max(6).default([]),
  /** 1-2 sentences for engine logs — what this pass noticed and what
   *  the Seeder considered but didn't note. Not user-facing. */
  reasoning: z.string().default(''),
  /** Staleness gate — echo doc_v from the payload. */
  based_on_v: z.number().int().nonnegative(),
});

export type SeederOutput = z.infer<typeof SeederOutputSchema>;
