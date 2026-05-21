// Detective output schema. v2 detective collaborates with the observer
// on the hypothesis ladder AND owns the StoryObject (the narrative
// spine the seer reads). private_thoughts is the model's scratchpad
// (≥half of the response), persisted to detective_log and fed back
// next call.
//
// Same defaults treatment as ObserverOutputSchema — the model frequently
// omits sub-objects/arrays it has nothing to add for this turn, and we
// want the call to succeed cleanly when that happens.

import { z } from 'zod';
import { LadderRungSchema } from '../shared';

export const DetectiveOutputSchema = z.object({
  new_hypotheses: z.array(z.object({
    id: z.string(),
    claim: z.string(),
    start_at: LadderRungSchema.optional(),
  })).default([]),
  hypothesis_ladder_moves: z.array(z.object({
    id: z.string(),
    to: LadderRungSchema,
  })).default([]),
  story_updates: z.object({
    fork: z.object({
      a: z.string(),
      b: z.string(),
      is_stasis: z.boolean(),
    }).optional(),
    present_pressure: z.string().optional(),
    past_root: z.string().optional(),
    stakes: z.object({
      on_a: z.string(),
      on_b: z.string(),
    }).optional(),
    hooks: z.array(z.string()).optional(),
  }).default({}),
  private_thoughts: z.string().default(''),
  reasoning: z.string().default(''),
});
