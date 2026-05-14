// Zod schemas for reading-agent I/O. Validated at the adapter boundary.

import { z } from 'zod';

const NarrativeRole = z.enum(['opening', 'rising', 'turning', 'closing']);

const CardAngle = z.object({
  position_id: z.string(),
  card_id: z.number().int().min(0),
  angle: z.string(),
  constraint: z.string(),
  narrative_role: NarrativeRole,
});

export const ReadingPlanSchema = z.object({
  arc_thesis: z.string(),
  cards: z.array(CardAngle),
});

const Beat = z.object({
  position_id: z.string(),
  text: z.string(),
});

export const ReadingSchema = z.object({
  intro: z.string(),
  beats: z.array(Beat),
  outro: z.string(),
});
