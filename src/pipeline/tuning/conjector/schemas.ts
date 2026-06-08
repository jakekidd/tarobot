// Zod contracts for the Conjector's three model ops. The schema IS the
// contract; the adapter validates every tool result against it and retries
// on a miss. Tool input_schemas are derived from these via z.toJSONSchema.

import { z } from 'zod';

/** One move in a thread: another probe (guess), or the committing reframe.
 *  The model chooses which each turn — budget pressure lives in the prompt,
 *  not in a forced step, so the Diviner keeps the implicit room it works in. */
export const MoveSchema = z.object({
  move: z.enum(['guess', 'commit']),
  /** The guess (a specific read in the player's voice) OR the reframe (the
   *  question under their question), per `move`. Lowercase, one sentence. */
  text: z.string().min(1),
  /** Private self-read: is this thread narrowing or stalling? Logged, not
   *  shown. Reserved for stall-forced-commit; the budget caps it for now. */
  convergence: z.enum(['narrowing', 'stalling']),
  /** Which portrait leads this move works — used to mark CLAIMED on close. */
  leads: z.array(z.string()).default([]),
});
export type Move = z.infer<typeof MoveSchema>;

/** The re-root (branching) step: a genuinely different territory than the
 *  dilemmas already found, or `fresh: false` to declare the field exhausted. */
export const RerootSchema = z.object({
  fresh: z.boolean(),
  /** The new territory to open on (when fresh). */
  territory: z.string().optional(),
  /** The angle to open with (when fresh). */
  opening: z.string().optional(),
  /** Why the field is exhausted (when not fresh). */
  reason: z.string().optional(),
});
export type Reroot = z.infer<typeof RerootSchema>;

/** The first-person thread close — the Compiler's deepen input. */
export const SummarySchema = z.object({
  summary_md: z.string().min(1),
  claimed_leads: z.array(z.string()).default([]),
});
export type Summary = z.infer<typeof SummarySchema>;
