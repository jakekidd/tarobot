// Random-name banks for the relationship_pick dice. Two gendered
// lists plus a derived combined list for they/them and unspecified
// pronouns. Names are picked for mid-tier mystical/evocative feel —
// elevated enough to suit a tarot session, not so witchy they read
// as costume. A few intentionally gender-neutral names appear in
// BOTH lists so they show up MORE often when rolling for they/them
// (per the design — slight favoring of bigender names for the
// combined bank).
//
// Source-of-truth lives in materials/names/{masc,fem}.txt — one name
// per line. Add / remove names there without touching this loader.

import MASC_RAW from '../../../materials/names/masc.txt?raw';
import FEM_RAW from '../../../materials/names/fem.txt?raw';

function parseNames(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export const MASC_NAMES = parseNames(MASC_RAW);
export const FEM_NAMES = parseNames(FEM_RAW);
export const COMBINED_NAMES = [...MASC_NAMES, ...FEM_NAMES];

/** Pick a random name from the appropriate bank. Optional `avoid`
 *  string ensures consecutive dice rolls give a different name. */
export function randomName(
  pronoun: 'him' | 'her' | 'them' | null,
  avoid?: string,
): string {
  const bank: readonly string[] =
    pronoun === 'him' ? MASC_NAMES
    : pronoun === 'her' ? FEM_NAMES
    : COMBINED_NAMES;
  if (!avoid) return bank[Math.floor(Math.random() * bank.length)]!;
  const others = bank.filter((n) => n !== avoid);
  return others[Math.floor(Math.random() * others.length)] ?? bank[0]!;
}
