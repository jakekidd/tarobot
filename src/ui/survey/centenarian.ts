// Centenarian interlude — sassy lamp-hang for users hiding their
// birthyear behind something like 19/19/1919 (which clamps to
// 12/19/1919, a real-but-implausible 100+ year old birthdate).
//
// We can't force a correct birthyear; sass is the better move. The
// turtle makes a compound comment when the computed age exceeds the
// CENTENARIAN_THRESHOLD, then offers a vampire / highlander pick to
// hang the lamp before continuing into the relationship_status
// question. 40% unhinged, 40% turtle.

/** Trigger threshold. Anyone over this gets the interlude. */
export const CENTENARIAN_THRESHOLD = 100;

/** Per-century in-character blurb. The compound dialogue line is:
 *  "damn. <age> years old. <blurb>. you're a dinosaur. are you a
 *  vampire or the highlander"
 *
 *  Keys are the lower bound of the century block the year falls into
 *  (e.g. 1800 covers 1800–1899). Looked up via centuryBlurb(year). */
const CENTURY_BLURBS: Array<{ from: number; blurb: string }> = [
  // 1900s: intentionally no blurb. centenarians born 1900-1925 are
  // close enough to "normal old" that the bit lands harder when we
  // skip straight to "you're a dinosaur." anything earlier gets the
  // era-specific drop.
  { from: 1900, blurb: '' },
  { from: 1800, blurb: "you watched the entire industrial revolution unfold like a slow movie" },
  { from: 1700, blurb: "you remember when pirates were a current career path" },
  { from: 1600, blurb: "you saw shakespeare's last plays come out as new releases" },
  { from: 1500, blurb: "the printing press was the hot new tech of your youth" },
  { from: 1400, blurb: "you were around when the renaissance was just getting warmed up" },
  { from: 1300, blurb: "you survived the entire black death cycle, allegedly" },
  { from: 1200, blurb: "the mongols were doing actual mongol things on your news feed" },
  { from: 1100, blurb: "the crusades were just your normal headlines" },
  { from: 1000, blurb: "you remember when the year 1000 freaked everyone out" },
  { from: 900,  blurb: "the vikings were doing actual viking stuff while you slept" },
  { from: 800,  blurb: "charlemagne was either your boss or your gym buddy" },
  { from: 700,  blurb: "the islamic golden age was the new cool thing of your day" },
  { from: 600,  blurb: "you saw the entire roman-to-byzantine pivot live" },
  { from: 500,  blurb: "the fall of rome was last decade's news cycle" },
  { from: 400,  blurb: "you actually saw the roman empire collapse, in person" },
  { from: 300,  blurb: "constantine was just some guy you might have met" },
  { from: 200,  blurb: "the roman empire was at peak vibes when you were a kid" },
  { from: 100,  blurb: "you remember when hadrian got that wall built" },
  { from: 0,    blurb: "you were alive for the actual lifetime of jesus christ. wild." },
];

/** Lookup. Always returns a blurb — defaults to the 0-AD line for
 *  any year < 100. Caps at the 1900 block (centuries beyond that
 *  use the 1900 blurb, but the trigger threshold prevents this
 *  from firing on under-100-year-olds anyway). */
export function centuryBlurb(year: number): string {
  for (const entry of CENTURY_BLURBS) {
    if (year >= entry.from) return entry.blurb;
  }
  return CENTURY_BLURBS[CENTURY_BLURBS.length - 1]!.blurb;
}

/** Build the full compound dialogue for the interlude. When the
 *  century blurb is empty (e.g. 1900s), skip it cleanly so the line
 *  reads "damn. N years old. you're a dinosaur. ..." without a
 *  double-space artifact. */
export function buildCentenarianLine(age: number, year: number): string {
  const blurb = centuryBlurb(year);
  const middle = blurb ? `${blurb} ` : '';
  return `damn. ${age} years old. ${middle}you're a dinosaur. are you a vampire or the highlander`;
}

/** Compute integer age from a birthday at today's wall-clock. */
export function ageFromBirthday(birthday: { year: number; month: number; day: number }): number {
  const now = new Date();
  const beforeBirthday =
    now.getMonth() + 1 < birthday.month
    || (now.getMonth() + 1 === birthday.month && now.getDate() < birthday.day);
  return now.getFullYear() - birthday.year - (beforeBirthday ? 1 : 0);
}
