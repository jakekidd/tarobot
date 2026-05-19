// Small helpers for the relationship_pick form: kin-term pronoun
// inference + the random name-color dice palette.
//
// Reserved colors (NEVER appear in the dice palette):
//   - Purple (#7c3aed and adjacent violets) — reserved for the user's
//     own name when the seer / cat references it.
//   - Turquoise (#22d3ee and adjacent cyans/teals) — reserved for the
//     seer's first-person ("me" / "I") references.
// Picking either of those for a relationship would muddle their
// load-bearing meaning downstream.
//
// Kin-term detection is intentionally NARROW. The rule: only auto-suggest
// pronouns when the user types a recognizable RELATIONAL label (mom,
// dad, mama, papa, etc.) — NOT when they type a real name (jeff, malachi,
// sarah). A name like "Ma" looks like a mom-shorthand but could be the
// start of "Malachi"; we err on the side of NOT inferring unless the
// match is unambiguous.

export type Pronouns = {
  subjective: 'he' | 'they' | 'she';
  objective: 'him' | 'them' | 'her';
};

/** Pronoun-set returned by a kin-term match. The form auto-fills these
 *  when detection fires AND the user hasn't manually touched the row. */
type KinPronouns = Pronouns;

const FEM_PRONOUNS: KinPronouns = { subjective: 'she', objective: 'her' };
const MASC_PRONOUNS: KinPronouns = { subjective: 'he', objective: 'him' };

/** Wide-spectrum accent colors for the name-color dice. Hand-picked to
 *  span the wheel WITHOUT touching the two reserved hue bands:
 *    • purple / violet / indigo / lavender  (≈ 250°–290°)
 *    • turquoise / cyan / teal             (≈ 160°–200°)
 *  Roughly: red → orange → amber → yellow → chartreuse → green → forest
 *           → sky-blue → hot pink → soft pink. */
export const NAME_ACCENT_PALETTE = [
  '#ef4444',  // red
  '#f97316',  // orange (warm; distinct from brand #ff9d3a)
  '#f59e0b',  // amber
  '#facc15',  // sun yellow
  '#a3e635',  // chartreuse
  '#4ade80',  // grass-green
  '#16a34a',  // forest-green
  '#60a5fa',  // sky-blue
  '#ec4899',  // hot pink
  '#f472b6',  // soft pink
];

/** Pick a random accent color. Optionally avoids a previous one so the
 *  dice always changes the value. */
export function randomAccent(prev?: string): string {
  if (!prev) {
    return NAME_ACCENT_PALETTE[Math.floor(Math.random() * NAME_ACCENT_PALETTE.length)]!;
  }
  const others = NAME_ACCENT_PALETTE.filter((c) => c !== prev);
  return others[Math.floor(Math.random() * others.length)]!;
}

/** Strict kin-term map. Only triggers on exact / clearly-prefixed matches.
 *  Returns the canonical pronoun set (or null when nothing applies). */
export function detectKinTerm(rawName: string): KinPronouns | null {
  const t = rawName.trim().toLowerCase();
  if (!t) return null;
  // Female: mom / mama / mommy / mother / mum
  if (/^(mom|mama|mommy|momma|mother|mum|mommie)$/.test(t)) return FEM_PRONOUNS;
  // Male: dad / papa / pop / pops / daddy / father
  if (/^(dad|daddy|papa|pop|pops|father)$/.test(t)) return MASC_PRONOUNS;
  return null;
}
