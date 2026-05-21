// Interrogator output schema — Phase 4 question-generation pipeline.
//
// The interrogator's only job is PHRASING. The detective decides
// strategy (what angle to probe, what to plant); the crowd writes
// decoys (blind to the doc); the interrogator writes the question
// stem itself. Single sentence, lowercase, ends with ?, ≤120 chars.
//
// It sees the detective's intent angle + 2-3 sample questions from
// materials/survey.md as phrasing scaffold. The samples teach voice,
// not content.

import { z } from 'zod';

export const InterrogatorOutputSchema = z.object({
  /** The literal question stem the user will see. Must be a single
   *  sentence, ≤120 chars, ends with '?'. */
  question_text: z.string().min(8).max(120),
  /** A short tag for the dimension this question is testing. Free
   *  observer-style label — used by adversarial selection + the
   *  coverage map. */
  axis_tag: z.string().min(1).max(40),
  /** 1-2 sentence note for engine logs. */
  reasoning: z.string().default(''),
});

export type InterrogatorOutput = z.infer<typeof InterrogatorOutputSchema>;
