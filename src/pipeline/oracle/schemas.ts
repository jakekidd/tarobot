import { z } from 'zod';
import { MOVES } from './types';

export const DirectorSetSchema = z.object({
  move: z.enum(MOVES),
  intent: z.string(),
  note: z.string(),
  approx_words: z.number().int().min(0).max(80),
});

export const BriefCardSchema = z.object({
  id: z.string(),
  slot: z.number().int().min(1).max(4),
  guide: z.string(),
});

/** what the compile call returns — identity fields ride in from the intake */
export const CompiledBriefSchema = z.object({
  portrait: z.string(),
  fork: z.object({ surface: z.string(), reframe: z.string() }).nullable(),
  leads: z.array(z.string()).min(1).max(4),
  cards: z.array(BriefCardSchema).length(4),
  opening: z.string(),
  mantra: z.string(),
});

/** the editable brief — what the beta page's JSON editor validates against.
 *  cards carry no name here; it is re-derived from the deck on load. */
export const EditableBriefSchema = z
  .object({
    name: z.string().optional(),
    companion: z.string().optional(),
    portrait: z.string(),
    fork: z.object({ surface: z.string(), reframe: z.string() }).nullable(),
    leads: z.array(z.string()),
    cards: z.array(BriefCardSchema),
    opening: z.string(),
    mantra: z.string(),
    taboos: z.array(z.string()),
  })
  .refine((b) => b.cards.length === 0 || b.cards.length === 4, {
    message: 'cards must be empty (chat) or exactly 4 (session)',
  });

export type EditableBrief = z.infer<typeof EditableBriefSchema>;
