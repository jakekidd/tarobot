// Profiler output schema — v3.2 hypothesis curator.
//
// THE PIVOT (v3.2): the profiler is no longer the prose-anchor writer.
// Whole-doc rewrites during the survey were structurally wrong — the
// more profile content existed mid-survey, the more the eventual
// reading became a proof of the profile rather than a discovery
// about the person (experiment finding, REFACTOR-V3.md §18).
//
// The profiler is now the CURATOR of the hypothesis list (doc.held).
// It reads history + verbatim log + assertion outcomes + detective
// state, and emits a small set of edits to the list:
//   - add        new hypotheses worth tracking
//   - promote    untested → confirmed (assertion confirmed it)
//   - refine     a hypothesis's claim with a correction
//   - refute     mark a hypothesis dead
//   - drop       remove a stale or superseded hypothesis entirely
//
// The compiler (close-pass agent) reads the final hypothesis list and
// writes the prose anchor narrowly around the resolved Dilemma. The
// profiler never touches the anchor.

import { z } from 'zod';

export const ProbeStatusSchema = z.enum([
  'untested',
  'probing',
  'confirmed',
  'refined_by_correction',
  'refuted',
  'dropped',
]);

/** A single edit to the hypothesis list. The engine applies these in
 *  order; later edits to the same id win. */
export const HypothesisEditSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    /** Stable id the profiler picks. Must be unique within this pass;
     *  engine ignores collisions with existing ids. */
    id: z.string().min(1),
    claim: z.string().min(1),
    status: ProbeStatusSchema.default('untested'),
    confidence: z.number().min(0).max(1).optional(),
    evidence_refs: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal('promote'),
    id: z.string().min(1),
    /** Required — what status to set. Typically 'confirmed' or
     *  'refined_by_correction'. */
    status: ProbeStatusSchema,
    confidence: z.number().min(0).max(1).optional(),
    evidence_refs: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal('refine'),
    id: z.string().min(1),
    /** Sharpened claim text. Often the user's verbatim correction
     *  woven in. */
    claim: z.string().min(1),
    status: ProbeStatusSchema.default('refined_by_correction'),
    confidence: z.number().min(0).max(1).optional(),
    evidence_refs: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal('refute'),
    id: z.string().min(1),
    /** Optional explanation; engine logs but doesn't store on the
     *  Probe itself. */
    reason: z.string().optional(),
  }),
  z.object({
    op: z.literal('drop'),
    id: z.string().min(1),
    reason: z.string().optional(),
  }),
]);

export const ProfilerOutputSchema = z.object({
  /** Ordered list of edits to apply to doc.held. Empty list is a
   *  valid pass — sometimes nothing needs adjusting. */
  hypothesis_edits: z.array(HypothesisEditSchema).default([]),
  /** 1-2 sentences for engine logs — what shifted this pass and why.
   *  Surfaces in the debug panel; not used downstream. */
  reasoning: z.string().default(''),
  /** The doc.v the profiler was reasoning about. Engine compares
   *  against current state.doc.v on apply — if stale, discards. */
  based_on_v: z.number().int().nonnegative(),
});

export type ProbeStatusV = z.infer<typeof ProbeStatusSchema>;
export type HypothesisEdit = z.infer<typeof HypothesisEditSchema>;
export type ProfilerOutput = z.infer<typeof ProfilerOutputSchema>;
