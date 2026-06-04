// Zod contract for materials/survey.json. The schema IS the contract — a
// malformed survey file fails loud at load rather than producing a silently
// broken survey. Mirrors the Channels shape in ./types, plus the two
// flatten-time scalars: `weight` (sort + shadow gate) and `shadow`.

import { z } from 'zod';

const ChannelsSchema = z.object({
  indicators: z.array(z.string()),
  implications: z.array(z.string()),
  identities: z.array(z.string()),
  hooks: z.array(z.string()),
  notes: z.array(z.string()),
});

export const SurveyOptionSchema = ChannelsSchema.extend({
  label: z.string().min(1),
  /** 0 inert · 1 mild · 2 warm · 3 hot. Sorts the amalgam and gates shadows. */
  weight: z.number().int().min(0).max(3),
  /** One line: what it means to NOT pick this. */
  shadow: z.string(),
});
export type SurveyOption = z.infer<typeof SurveyOptionSchema>;

export const SurveyFacetSchema = z.object({
  slug: z.string().min(1),
  facet: z.string().min(1),
  question: z.string().min(1),
  hidden_target: z.string().optional(),
  options: z.array(SurveyOptionSchema).min(2),
});
export type SurveyFacet = z.infer<typeof SurveyFacetSchema>;

export const SurveyDocSchema = z.object({
  version: z.number(),
  // Free-form documentation block for authors. Not consumed at runtime.
  authoring: z.unknown().optional(),
  facets: z.array(SurveyFacetSchema).min(1),
});
export type SurveyDoc = z.infer<typeof SurveyDocSchema>;
