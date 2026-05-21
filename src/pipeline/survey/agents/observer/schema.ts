// Observer output schema — v2 delta-on-scaffold.
//
// The observer is the single writer of LivingDoc. Instead of
// re-emitting the entire psychological doc every turn (the v1 model,
// which cost O(turn²) tokens), it emits a small DELTA describing
// what changed. The engine applies the delta to doc.scaffold +
// doc.margin and bumps doc.v.
//
// All fields default to safe empty values — the model can legitimately
// have "no axis update this turn" and emit an empty axes_updates
// without failing the schema.

import { z } from 'zod';

export const TemporalLeanSchema = z.enum(['past', 'present', 'future']);

export const ObserverDeltaSchema = z.object({
  /** Axis name → new content. REPLACES the prior content for that
   *  axis in doc.scaffold.axes. Axes are observer-named (no fixed
   *  taxonomy) — the model picks the label that fits the observation.
   *  Empty record = no axis update this turn. */
  axes_updates: z.record(z.string(), z.string()).default({}),
  /** Cast member updates by label. Each { label, notes } REPLACES
   *  that cast member's notes in doc.scaffold.cast_notes. */
  cast_updates: z.array(z.object({
    label: z.string(),
    notes: z.string(),
  })).default([]),
  /** New tells this turn (latency / hesitation / hover-then-tap flags).
   *  Appended to doc.scaffold.tells; engine evicts oldest past TELLS_CAP. */
  tells: z.array(z.string()).default([]),
  /** One new margin entry (high-variance observation; the fluid layer).
   *  Engine appends to doc.margin and evicts oldest past MARGIN_CAP.
   *  Empty string = no margin entry this turn. */
  margin_append: z.string().default(''),
  /** Inferred temporal stance of the reading. Set when the observer
   *  has enough signal to call it; leave omitted otherwise (the
   *  prior value sticks). null explicitly resets. */
  temporal_lean: TemporalLeanSchema.nullable().optional(),
  /** Held-probe lifecycle hints from the observer:
   *    - elevate[id]: probe was confirmed by this turn's evidence;
   *      engine drops it from held and adds the claim as a one-line
   *      axis_update (under observer-chosen key)
   *    - refute[id]: probe was contradicted; engine drops from held */
  probe_elevate: z.array(z.string()).default([]),
  probe_refute: z.array(z.string()).default([]),
});

export const ObserverOutputSchema = z.object({
  delta: ObserverDeltaSchema,
  /** The doc.v the observer was reasoning about. Engine compares
   *  against current state.doc.v on apply — if stale, discards. */
  based_on_v: z.number().int().nonnegative(),
  /** 1-2 sentences for engine logs — what this turn's observation
   *  was. Not surfaced to user or seer. */
  reasoning: z.string().default(''),
});

export type ObserverDelta = z.infer<typeof ObserverDeltaSchema>;
export type ObserverOutput = z.infer<typeof ObserverOutputSchema>;
