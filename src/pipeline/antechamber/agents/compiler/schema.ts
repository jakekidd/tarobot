// Compiler output schema — the DilemmaDocument.
//
// The compiler-as-sieve runs ONCE per session, AFTER the user has
// submitted their intention. It reads the unified transcript + WEAVER
// candidate set + user_intention and produces the structured Dilemma
// document the seer consumes. See docs/DILEMMA-SCHEMA.md for the
// load-bearing intent behind each field.
//
// The engine renders this document to a markdown anchor for the
// existing Seer profile-assembly path (state.anchor) and also stores
// the structured form (state.dilemma) for future direct reads.

import { z } from 'zod';

export const DomainTagSchema = z.enum([
  'work',
  'love',
  'belonging',
  'shelter',
  'family',
  'self',
  'mortality',
  'meaning',
]);
export type DomainTag = z.infer<typeof DomainTagSchema>;

export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const AwarenessSchema = z.enum(['aware', 'partial', 'unaware']);
export type Awareness = z.infer<typeof AwarenessSchema>;

export const ResolutionPathSchema = z.enum([
  'matched-candidate',
  'strongest-candidate',
  'created-from-intent',
  'null-landing',
]);
export type ResolutionPath = z.infer<typeof ResolutionPathSchema>;

export const CriticalHypothesisSchema = z.object({
  claim: z.string(),
  evidence: z.string(),
  confidence: ConfidenceSchema,
});
export type CriticalHypothesis = z.infer<typeof CriticalHypothesisSchema>;

export const ForkSchema = z.object({
  do_nothing_branch: z.string(),
  alternative_branch: z.string(),
});

export const DilemmaDocumentSchema = z.object({
  // Provenance
  subject_name: z.string(),
  doc_v: z.number().int().nonnegative(),
  resolution_path: ResolutionPathSchema,
  reasoning: z.string().default(''),

  // The Dilemma — load-bearing core
  label: z.string(),
  delta_description: z.string(),
  fork: ForkSchema,
  awareness: AwarenessSchema,
  confidence: ConfidenceSchema,
  domain_tags: z.array(DomainTagSchema),
  null_landing: z.boolean(),

  // Critical hypotheses — load-bearing claims with anchored evidence
  critical_hypotheses: z.array(CriticalHypothesisSchema),

  // Freeform regions
  specifics: z.string().default(''),
  holding: z.string().default(''),
  suspicions: z.string().default(''),
});
export type DilemmaDocument = z.infer<typeof DilemmaDocumentSchema>;

/** Legacy alias — the engine still routes the rendered markdown into
 *  state.anchor for the existing Seer assembleProfile bridge. The
 *  compiler now returns a DilemmaDocument; the engine renders it. */
export type CompilerOutput = DilemmaDocument;
export const CompilerOutputSchema = DilemmaDocumentSchema;
