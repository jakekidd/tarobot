// Compiler output schema — v3.2 close-pass anchor writer.
//
// The compiler runs ONCE at survey close. Reads the profiler's curated
// hypothesis list + history + verbatim log + anchor template, and
// produces the prose Subject Anchor narrowly around the resolved
// Dilemma. This is the artifact that ships to the seer.

import { z } from 'zod';

export const CompilerOutputSchema = z.object({
  /** Full markdown Subject Anchor, starting with `# Subject Anchor — name`
   *  and containing the section set from the template. Most sections
   *  should be short or empty; only the Dilemma section earns full
   *  weight. */
  anchor: z.string(),
  /** The hypothesis id the compiler identified as the Dilemma. Null
   *  when no Dilemma resolved (null-landing case). Lets the debug
   *  panel highlight which hypothesis won and lets future telemetry
   *  trace from picks_log → hypothesis → Dilemma. */
  dilemma_id: z.string().nullable(),
  /** 1-2 sentences for engine logs — which hypothesis won and why. */
  reasoning: z.string().default(''),
  /** Staleness gate. */
  based_on_v: z.number().int().nonnegative(),
});

export type CompilerOutput = z.infer<typeof CompilerOutputSchema>;
