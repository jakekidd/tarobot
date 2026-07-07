// The Deck Bible — full 78-card Rider-Waite, authored per-suit under
// materials/oracle/deck/ (editable on GitHub without a code change).
// Model-facing readers: the compile call (binds visitor material to
// card charges) and the ensemble's flip enrichment (driver + attention
// receive a flipped card's symbols and charge).

import { z } from 'zod';
import majorsRaw from '../../../materials/oracle/deck/majors.json?raw';
import wandsRaw from '../../../materials/oracle/deck/wands.json?raw';
import cupsRaw from '../../../materials/oracle/deck/cups.json?raw';
import swordsRaw from '../../../materials/oracle/deck/swords.json?raw';
import pentaclesRaw from '../../../materials/oracle/deck/pentacles.json?raw';

const DeckCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  arcana: z.enum(['major', 'minor']),
  suit: z.enum(['wands', 'cups', 'swords', 'pentacles']).optional(),
  rank: z.string().optional(),
  symbols: z.array(z.string()),
  themes: z.array(z.string()),
  shadow: z.array(z.string()),
  /** the question this card puts to a person — mirror-shaped, what the
   *  compile binds visitor material against */
  charge: z.string(),
  voice_note: z.string(),
});

export type OracleDeckCard = z.infer<typeof DeckCardSchema>;

const FileSchema = z.array(DeckCardSchema);

export const ORACLE_DECK: readonly OracleDeckCard[] = [
  ...FileSchema.length(22).parse(JSON.parse(majorsRaw)),
  ...FileSchema.length(14).parse(JSON.parse(wandsRaw)),
  ...FileSchema.length(14).parse(JSON.parse(cupsRaw)),
  ...FileSchema.length(14).parse(JSON.parse(swordsRaw)),
  ...FileSchema.length(14).parse(JSON.parse(pentaclesRaw)),
];

export function deckCard(id: string): OracleDeckCard | undefined {
  return ORACLE_DECK.find((c) => c.id === id);
}
