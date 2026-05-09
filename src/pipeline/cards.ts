import { TAROT_DECK } from './data/tarot-deck';
import type { Card, DrawnCard, DrawnCards, Spread } from './types';

export const ALL_CARDS: readonly Card[] = TAROT_DECK;

/**
 * Draw N unique cards from the deck. MVP is upright-only (no reversed).
 * Uses Fisher-Yates over a copy; order is the draw order.
 */
export function drawCards(count: number, rng: () => number = Math.random): Card[] {
  if (count < 0 || count > TAROT_DECK.length) {
    throw new Error(`drawCards: invalid count ${count}`);
  }
  const pool = TAROT_DECK.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}

/**
 * Draw cards for a given spread. Each position receives one card,
 * in spread.positions order. Pairs are returned in DrawnCards.cards.
 */
export function drawForSpread(spread: Spread, rng: () => number = Math.random): DrawnCards {
  const cards = drawCards(spread.positions.length, rng);
  const drawn: DrawnCard[] = spread.positions.map((position, idx) => ({
    position,
    card: cards[idx]!,
  }));
  return { spread, cards: drawn };
}

export function getCard(id: number): Card | undefined {
  return TAROT_DECK[id];
}

export function findByName(name: string): Card | undefined {
  const lower = name.toLowerCase();
  return TAROT_DECK.find((c) => c.name.toLowerCase() === lower);
}
