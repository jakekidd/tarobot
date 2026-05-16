// Zod schemas for reading-agent I/O. Validated at the adapter boundary.

import { z } from 'zod';

const NarrativeRole = z.enum(['opening', 'rising', 'turning', 'closing']);

export const ClinicalIntentSchema = z.object({
  position_id: z.string(),
  card_id: z.number().int().min(0),
  flip_round: z.number().int().min(1).max(4),
  narrative_role: NarrativeRole,
  angle: z.string(),
  noticings: z.array(z.string()).min(1).max(4),
  structural_prediction: z.string(),
  director_notes: z.string(),
});

export const MonologueSchema = z.object({
  text: z.string(),
  prompt_to_user: z.string().optional(),
});

export const ClosingIntentSchema = z.object({
  takeaway: z.string(),
  director_notes: z.string(),
});
