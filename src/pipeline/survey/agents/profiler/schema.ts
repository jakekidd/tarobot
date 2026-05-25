// Profiler output schema — v3 whole-doc rewrite.
//
// The profiler emits the full markdown Subject Anchor on each pass,
// not deltas. (Per REFACTOR-V3.md §13: "Rewrite the whole anchor doc
// on each resolution event during development. Recompute cost is not
// a concern now, and watching the document evolve turn-by-turn in
// the debug panel is exactly the visible-thinking we want.")
//
// The suspicions_raised / suspicions_dropped fields exist for the
// debug panel's diff view; they're not load-bearing for downstream
// consumers and are an LLM courtesy, not a derived diff.

import { z } from 'zod';

export const ProfilerOutputSchema = z.object({
  /** Full markdown Subject Anchor, starting with `# Subject Anchor — name`
   *  and containing one `## <heading>` per active section in the
   *  template, in order. */
  anchor: z.string(),
  /** 1-2 sentences for engine logs — what this pass changed and what
   *  the profiler held back from promoting. Not surfaced to user or
   *  seer. */
  reasoning: z.string().default(''),
  /** Suspicions raised this pass (one short line each) — surfaces in
   *  the debug panel's profiler workspace as the diff feedback. */
  suspicions_raised: z.array(z.string()).default([]),
  /** Suspicions dropped this pass (because they were refuted or
   *  absorbed into a confirmed read). */
  suspicions_dropped: z.array(z.string()).default([]),
  /** The doc.v the profiler was reasoning about. Engine compares
   *  against current state.doc.v on apply — if stale, discards. */
  based_on_v: z.number().int().nonnegative(),
});

export type ProfilerOutput = z.infer<typeof ProfilerOutputSchema>;
