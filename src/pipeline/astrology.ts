// Astrology / numerology derivations from a birth date. Pure functions —
// safe to compute on the client immediately when the survey collects the
// answer. Three systems unlock from one input:
//   1. Western tropical sun sign      (date-band lookup)
//   2. Numerological life path number (digit reduction, master numbers preserved)
//   3. Tarot birth card               (Mary K. Greer's additive method, Major Arcana 0-21)

export type SunSign =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export type BirthDate = {
  year: number;
  month: number;   // 1-12
  day: number;     // 1-31
};

export type TarotBirthCard = {
  number: number;  // 0-21
  name: string;
};

export type AstroProfile = {
  birthDate: BirthDate;
  sunSign: SunSign;
  lifePath: number;            // 1-9, or master 11 / 22 / 33
  tarotBirthCard: TarotBirthCard;
};

// Major Arcana, Rider-Waite-Smith ordering. Strength = 8, Justice = 11.
const MAJOR_ARCANA: readonly string[] = [
  'the fool', 'the magician', 'the high priestess', 'the empress', 'the emperor',
  'the hierophant', 'the lovers', 'the chariot', 'strength', 'the hermit',
  'wheel of fortune', 'justice', 'the hanged man', 'death', 'temperance',
  'the devil', 'the tower', 'the star', 'the moon', 'the sun', 'judgement', 'the world',
];

// ─── Sun sign ──────────────────────────────────────────────────

/** Accepts "MM-DD" or "YYYY-MM-DD" or { month, day }. Returns sun sign or null. */
export function computeSunSign(
  input: string | { month: number; day: number },
): SunSign | null {
  let month: number;
  let day: number;
  if (typeof input === 'string') {
    // "YYYY-MM-DD"
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input.trim());
    if (iso) {
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else {
      // "MM-DD"
      const m = /^(\d{1,2})-(\d{1,2})$/.exec(input.trim());
      if (!m) return null;
      month = Number(m[1]);
      day = Number(m[2]);
    }
  } else {
    month = input.month;
    day = input.day;
  }
  return sunSignFor(month, day);
}

export function sunSignFor(month: number, day: number): SunSign | null {
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'aries';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'taurus';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'gemini';
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'cancer';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'leo';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'virgo';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'libra';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'scorpio';
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'sagittarius';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'capricorn';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'aquarius';
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'pisces';
  return null;
}

// ─── Life path ─────────────────────────────────────────────────

/** Reduce a number to a single digit, preserving master numbers 11 / 22 / 33. */
function reducePreservingMaster(n: number): number {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split('').reduce((acc, c) => acc + Number(c), 0);
  }
  return n;
}

/**
 * "Reduce each component, then sum" numerology life path:
 *   reduce(month) + reduce(day) + reduce(year) → reduce
 * Master numbers (11, 22, 33) are preserved at every reduction step.
 */
export function lifePathFor(date: BirthDate): number {
  const m = reducePreservingMaster(date.month);
  const d = reducePreservingMaster(date.day);
  const y = reducePreservingMaster(date.year);
  return reducePreservingMaster(m + d + y);
}

// ─── Tarot birth card ──────────────────────────────────────────

/**
 * Tarot Birth Card via the additive method: sum month + day + year, then
 * reduce by digit sum until ≤ 22. 0-21 map directly to the Major Arcana;
 * a result of 22 collapses back to The Fool (0) by convention.
 */
export function tarotBirthCardFor(date: BirthDate): TarotBirthCard {
  let n = date.month + date.day + date.year;
  while (n > 22) {
    n = String(n).split('').reduce((acc, c) => acc + Number(c), 0);
  }
  if (n === 22) n = 0;
  return { number: n, name: MAJOR_ARCANA[n] ?? 'the fool' };
}

// ─── Combined ──────────────────────────────────────────────────

export function computeAstroProfile(date: BirthDate): AstroProfile {
  const sun = sunSignFor(date.month, date.day);
  return {
    birthDate: date,
    sunSign: sun ?? 'aries',     // sunSignFor only nulls on malformed input
    lifePath: lifePathFor(date),
    tarotBirthCard: tarotBirthCardFor(date),
  };
}

/** Parse a BirthDate from an ISO-ish "YYYY-MM-DD" string. Returns null if invalid. */
export function parseBirthDate(s: string): BirthDate | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return { year, month, day };
}

/**
 * Short human-readable summary of an AstroProfile. Lowercase register
 * matches Clat's voice; suitable for the compiler's user payload or debug.
 */
export function summarizeAstro(astro: AstroProfile): string {
  const lp = astro.lifePath === 11 || astro.lifePath === 22 || astro.lifePath === 33
    ? `${astro.lifePath} (master)`
    : String(astro.lifePath);
  return `sun: ${astro.sunSign}. life path: ${lp}. tarot birth card: ${astro.tarotBirthCard.name}.`;
}
