// Sun-sign computation. Pure function. No deps.

export type SunSign =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

/** Accepts "MM-DD" or { month, day }. Returns sun sign or null. */
export function computeSunSign(input: string | { month: number; day: number }): SunSign | null {
  let month: number;
  let day: number;
  if (typeof input === 'string') {
    const m = input.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    month = parseInt(m[1]!, 10);
    day = parseInt(m[2]!, 10);
  } else {
    month = input.month;
    day = input.day;
  }
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
