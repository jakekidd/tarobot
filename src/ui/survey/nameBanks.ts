// Random-name banks for the relationship_pick dice. Two gendered
// lists plus a derived combined list for they/them and unspecified
// pronouns. Names are picked for mid-tier mystical/evocative feel —
// elevated enough to suit a tarot session, not so witchy they read
// as costume. A few intentionally gender-neutral names appear in
// BOTH lists so they show up MORE often when rolling for they/them
// (per the design — slight favoring of bigender names for the
// combined bank).
//
// Add freely. Each list independent. No collisions to worry about.

export const MASC_NAMES = [
  'Atlas', 'Cyrus', 'Orion', 'Caspian', 'Silas',
  'Felix', 'Augustin', 'Cassius', 'Theo', 'Roman',
  'Magnus', 'Phoenix', 'Sage', 'Linus', 'Casper',
  'Soren', 'Arlo', 'Wilder', 'Ezra', 'Tobias',
  'Rune', 'Mateo', 'Idris', 'Cosmo', 'Levi',
  'Ronin', 'Lior', 'Emery', 'Wren', 'Frederick',
] as const;

export const FEM_NAMES = [
  'Iris', 'Juno', 'Stella', 'Nova', 'Aurora',
  'Luna', 'Hazel', 'Willa', 'Maeve', 'Cora',
  'Lyra', 'Astrid', 'Elowen', 'Saoirse', 'Lila',
  'Ottilie', 'Romy', 'Isolde', 'Cleo', 'Indira',
  'Mira', 'Calla', 'Vesper', 'Anouk', 'Octavia',
  'Bea', 'Wren', 'Sage', 'Phoenix', 'Sloane',
] as const;

export const COMBINED_NAMES = [...MASC_NAMES, ...FEM_NAMES] as const;

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
