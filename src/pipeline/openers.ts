// Opener selection for the tent. The Compiler returns up to 3 in preference
// order; we roll 50/30/20 for slots 1/2/3 and fall back to slot 0 if a
// chosen slot is empty.

import type { Question } from './types';

export function pickOpener(openers: Question[], rng: () => number = Math.random): Question | null {
  if (openers.length === 0) return null;
  const weights = [0.5, 0.3, 0.2].slice(0, openers.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return openers[i] ?? openers[0]!;
  }
  return openers[0]!;
}
