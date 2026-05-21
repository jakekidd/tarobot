// Zod schemas for reading-agent I/O. Validated at the adapter boundary.

import { z } from 'zod';

const NarrativeRole = z.enum(['opening', 'rising', 'turning', 'closing']);

/** A Set — Stanislavski "given circumstances" the seer inhabits.
 *  Interior state, not content. The actor does not paraphrase this. */
export const SetSchema = z.object({
  position_id: z.string(),
  card_id: z.number().int().min(0),
  flip_round: z.number().int().min(1).max(4),
  narrative_role: NarrativeRole,

  click: z.string(),
  attending: z.string(),
  intent: z.string(),
  // `knows` is lenient — model sometimes returns null or omits it.
  // (Can't use .transform here — z.toJSONSchema rejects transforms.)
  knows: z.array(z.string()).max(5).nullable().optional(),
  uncertainty: z.string().default(''),
  through_line: z.string().default(''),
  // `reframe` is OPTIONAL in spec ("emit only when card supports it").
  // .nullable().optional() = accepts undefined, null, or valid object.
  // Consumers check `if (set.reframe)` which is true for neither null
  // nor undefined.
  reframe: z.object({
    user_belief: z.string(),
    cards_invitation: z.string(),
  }).nullable().optional(),
});

/** @deprecated Use SetSchema. */
export const ClinicalIntentSchema = SetSchema;

export const MonologueSchema = z.object({
  text: z.string(),
  // Model frequently emits `prompt_to_user: null` for beats without a
  // user prompt. Accept either; consumers null-check before using.
  prompt_to_user: z.string().nullable().optional(),
});

export const ClosingIntentSchema = z.object({
  takeaway: z.string(),
  director_notes: z.string().default(''),
});
