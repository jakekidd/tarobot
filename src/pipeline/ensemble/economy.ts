// The word economy — pacing, never permission. The budget sizes lines;
// it never gates whether the oracle may speak. Carry license fires when
// the visitor underfeeds.

import { countWords, type Beat, type EnsembleConstants, type ScrollEntry } from './types';

export function fillFromLine(budget: number, text: string, c: EnsembleConstants): number {
  return Math.min(budget + Math.round(c.FILL_K * Math.log(1 + countWords(text))), c.WORD_MAX);
}

export function fillFromSilence(budget: number, c: EnsembleConstants): number {
  return Math.min(budget + c.SILENCE_FILL, c.WORD_MAX);
}

export function spend(budget: number, line: string): number {
  return Math.max(0, budget - countWords(line));
}

/** visitor word-share over the last RATIO_WINDOW turns. a turn spans one
 *  oracle speech commit to the next; approximated here over the trailing
 *  beats window, which is equivalent for the ratio's purpose. */
export function talkRatio(scroll: readonly ScrollEntry[], c: EnsembleConstants): number {
  const beats = scroll.filter((e): e is Beat => e.kind === 'beat');
  // Walk back RATIO_WINDOW oracle commits.
  let oracleSeen = 0;
  let start = 0;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (beats[i].speaker === 'oracle') {
      oracleSeen += 1;
      if (oracleSeen >= c.RATIO_WINDOW) {
        start = i;
        break;
      }
    }
  }
  const window = beats.slice(start);
  let visitor = 0;
  let total = 0;
  for (const b of window) {
    const w = countWords(b.text);
    total += w;
    if (b.speaker === 'visitor') visitor += w;
  }
  if (total === 0) return 0.5;
  return visitor / total;
}

/** carry = the visitor is underfeeding in absolute terms. never derived
 *  from word-share: the oracle talking more would lower the visitor's
 *  share and self-license even more oracle words. */
export function carryFromScroll(
  scroll: readonly ScrollEntry[],
  c: EnsembleConstants,
): boolean {
  const visitorBeats = scroll.filter(
    (e): e is Beat => e.kind === 'beat' && e.speaker === 'visitor',
  );
  if (visitorBeats.length < c.CARRY_WINDOW) return false; // too early to judge
  const recent = visitorBeats.slice(-c.CARRY_WINDOW);
  const mean = recent.reduce((n, b) => n + countWords(b.text), 0) / recent.length;
  return mean < c.CARRY_VISITOR_WORDS;
}

export function cap(budget: number, carry: boolean, c: EnsembleConstants): number {
  const round5 = Math.round(budget / 5) * 5;
  const floor = carry ? Math.max(c.CAP_MIN, c.CARRY_CAP_MIN) : c.CAP_MIN;
  return Math.min(c.CAP_MAX, Math.max(floor, round5));
}
