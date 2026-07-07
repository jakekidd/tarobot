// The stall catalog — the brake's repertoire. Each kind carries the
// guidance the persona receives as its assignment. Weighted random when
// the driver does not name a kind itself.

import type { StallKind } from './types';

export const STALL_GUIDANCE: Record<StallKind, string> = {
  reflect_back:
    'repeat back the essence of what you just heard, in their words distilled. no interpretation added.',
  question_direct: 'ask one direct question about what they just said.',
  confirm_feeling: 'name the feeling you suspect under their last line, and check it.',
  question_detail: 'ask for one concrete detail: when, where, who.',
  observation: 'offer one small observation about them or the moment. draw no conclusion.',
  invite: 'a minimal door-opener. "go on." "say more about that." nothing else.',
};

export function pickStallKind(
  weights: Record<StallKind, number>,
  random: () => number = Math.random,
): StallKind {
  const entries = Object.entries(weights) as [StallKind, number][];
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return 'question_direct';
  let roll = random() * total;
  for (const [kind, w] of entries) {
    roll -= Math.max(0, w);
    if (roll <= 0) return kind;
  }
  return entries[entries.length - 1][0];
}
