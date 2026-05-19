// Small helpers for the relationship_pick form: kin-term gender / pronoun
// inference, brand-color palette for gender quick-picks, and a wider
// accent-color palette for the random name-color dice.
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

export type GenderPick = 'masc' | 'enby' | 'fem';

/** 3 brand-tier gender colors, matched to the gender quick-picks. */
export const GENDER_COLORS: Record<GenderPick, string> = {
  masc: '#22d3ee',  // turquoise — the local-LLM accent tone, repurposed
  enby: '#ff9d3a',  // brand orange (also used by the jade override asterisk)
  fem:  '#7c3aed',  // brand violet — Tarobot's primary
};

export const GENDER_DEFAULT_PRONOUNS: Record<GenderPick, Pronouns> = {
  masc: { subjective: 'he',   objective: 'him' },
  enby: { subjective: 'they', objective: 'them' },
  fem:  { subjective: 'she',  objective: 'her' },
};

/** Wide-spectrum accent colors for the name-color dice. Picked to avoid
 *  the canonical UI colors (violet/turquoise/orange/red) so a person's
 *  name stays distinct from existing chrome. */
export const NAME_ACCENT_PALETTE = [
  '#f6c453',  // amber
  '#a3e635',  // chartreuse
  '#34d399',  // mint
  '#06b6d4',  // cyan-bright (distinct from the local-LLM turquoise)
  '#60a5fa',  // sky
  '#a78bfa',  // soft violet (distinct from brand violet)
  '#f472b6',  // pink
  '#fb7185',  // coral
  '#facc15',  // sun
  '#4ade80',  // grass
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
 *  Returns null when nothing applies. */
export function detectKinTerm(rawName: string): GenderPick | null {
  const t = rawName.trim().toLowerCase();
  if (!t) return null;
  // Female: mom / mama / mommy / mother / mum
  if (/^(mom|mama|mommy|momma|mother|mum|mommie)$/.test(t)) return 'fem';
  // Male: dad / papa / pop / pops / daddy / father
  if (/^(dad|daddy|papa|pop|pops|father)$/.test(t)) return 'masc';
  return null;
}
