// Crowd output schema — Phase 4 question-generation pipeline.
//
// The crowd is intentionally BLIND to the LivingDoc, the leading
// hypothesis, the user, everything. It only sees the question stem
// the interrogator wrote. Its job: write 2-3 honest decoys — what
// would a representative crowd say to this question? Family Feud
// style.
//
// The blindness is the load-bearing part. If the crowd could see
// the doc, it would unconsciously write decoys that confirm the
// detective's leading hypothesis. The whole point of the blind crowd
// is to inject off-archetype variance into the option set so the
// planted option (from the detective) doesn't pre-determine the
// answer.

import { z } from 'zod';

export const CrowdOutputSchema = z.object({
  /** Two to three decoy options — what a representative crowd of
   *  honest answerers would say to this question. Each option is a
   *  short phrase (1-40 chars), no compound sentences. */
  decoys: z.array(z.string().min(1).max(40)).min(2).max(3),
  /** 1-2 sentence note for engine logs. */
  reasoning: z.string().default(''),
});

export type CrowdOutput = z.infer<typeof CrowdOutputSchema>;
