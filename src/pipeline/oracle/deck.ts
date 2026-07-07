// The oracle mini-deck — the Deck Bible's demo form. Its only model-facing
// reader is the compile call; the beta UI reads names for card backs.

import { z } from 'zod';
import deckRaw from '../../../materials/oracle/deck.json?raw';

const DeckCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbols: z.array(z.string()),
  themes: z.array(z.string()),
  shadow: z.array(z.string()),
  voice_note: z.string(),
});

export type OracleDeckCard = z.infer<typeof DeckCardSchema>;

export const ORACLE_DECK: readonly OracleDeckCard[] = z
  .array(DeckCardSchema)
  .min(8)
  .parse(JSON.parse(deckRaw));

export function deckCard(id: string): OracleDeckCard | undefined {
  return ORACLE_DECK.find((c) => c.id === id);
}
