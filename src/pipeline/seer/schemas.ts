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
  knows: z.array(z.string()).min(0).max(5),
  uncertainty: z.string(),
  through_line: z.string(),
  reframe: z.object({
    user_belief: z.string(),
    cards_invitation: z.string(),
  }).optional(),
});

/** @deprecated Use SetSchema. */
export const ClinicalIntentSchema = SetSchema;

export const MonologueSchema = z.object({
  text: z.string(),
  prompt_to_user: z.string().optional(),
});

export const ClosingIntentSchema = z.object({
  takeaway: z.string(),
  director_notes: z.string(),
});
