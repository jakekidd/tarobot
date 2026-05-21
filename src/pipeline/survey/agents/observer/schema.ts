// Observer output schema. Validates the tool call at the adapter
// boundary; malformed model output throws and the engine drops the
// pipeline turn (the seeder + telemetry still landed deterministically).
//
// v2 observer: psychological profiler with explicit speculation
// authority. Emits a FULL rewrite of profile.body markdown each turn,
// plus updated hooks/edges/side_channel arrays, cast notes, and
// hypothesis ladder moves. All fields default to safe empty values
// because the model regularly omits fields it has no content for —
// treating them as optional + defaulted prevents the whole tool call
// from failing the schema check when it's actually fine on the load-
// bearing parts (profile_body, hooks).

import { z } from 'zod';
import { LadderRungSchema } from '../shared';

export const ObserverOutputSchema = z.object({
  profile_body: z.string().default(''),
  hooks: z.array(z.string()).default([]),
  edges: z.array(z.string()).default([]),
  side_channel: z.object({
    signals: z.string().optional(),
    patterns: z.string().optional(),
    contradictions: z.string().optional(),
    avoidances: z.string().optional(),
  }).default({}),
  cast_notes_updates: z.array(z.object({
    label: z.string(),
    notes: z.string(),
  })).default([]),
  hypothesis_ladder_moves: z.array(z.object({
    id: z.string(),
    to: LadderRungSchema,
  })).default([]),
  reasoning: z.string().default(''),
});
