// Glyph + roman-numeral helpers for tarot cards. Used by the placeholder
// card face renderer. Real art replaces this later; the contract — each
// card has a glyph + label — stays the same.

import type { Card } from '../../pipeline';

// Major Arcana glyphs. Chosen for cross-platform unicode rendering.
const MAJOR_GLYPHS: readonly string[] = [
  '◯',  // 0 The Fool
  '✦',  // 1 The Magician
  '☾',  // 2 The High Priestess
  '✿',  // 3 The Empress
  '▣',  // 4 The Emperor
  '☥',  // 5 The Hierophant
  '♥',  // 6 The Lovers
  '⚜',  // 7 The Chariot
  '✪',  // 8 Strength
  '◐',  // 9 The Hermit
  '⊕',  // 10 Wheel of Fortune
  '⚖',  // 11 Justice
  '⚓',  // 12 The Hanged Man
  '☠',  // 13 Death
  '⚯',  // 14 Temperance
  '⛧',  // 15 The Devil
  '⚡',  // 16 The Tower
  '★',  // 17 The Star
  '☽',  // 18 The Moon
  '☼',  // 19 The Sun
  '◬',  // 20 Judgement
  '⊜',  // 21 The World
];

const SUIT_GLYPH: Record<string, string> = {
  wands: '✦',
  cups: '♥',
  swords: '✕',
  pentacles: '◈',
};

const ROMAN: readonly string[] = [
  'O',
  'I', 'II', 'III', 'IV', 'V',
  'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV',
  'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI',
];

export function glyphFor(card: Card): string {
  const n = card.number;
  if (card.arcana === 'major' && n !== undefined && n >= 0 && n < MAJOR_GLYPHS.length) {
    return MAJOR_GLYPHS[n]!;
  }
  return SUIT_GLYPH[card.arcana] ?? '✧';
}

export function numeralFor(card: Card): string {
  const n = card.number;
  if (card.arcana === 'major' && n !== undefined && n >= 0 && n < ROMAN.length) {
    return ROMAN[n]!;
  }
  if (n !== undefined && n >= 1 && n <= 10) return String(n);
  return '?';
}

/** Short display label, e.g. "the tower" → "tower" for minor "ace of cups" → "ace of cups". */
export function labelFor(card: Card): string {
  return card.name.toLowerCase();
}
