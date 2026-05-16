// Latency catchphrases. Two pools, keyed by which tier the reader is
// currently waiting on. Cognition pool is for things only cloud Claude
// can answer; persona pool is for the voicing step (eventually local OSS
// LLM). Distinguishing them visually telegraphs which kind of wait the
// user is enduring — and where future optimization will pay off.
//
// Hardcoded for now. The eventual production system may want a way for
// the persona to author its own stall (or to draw from a private bank
// that the user has not heard).

export type StallTier = 'cognition' | 'persona';

const COGNITION_STALLS = [
  'looking into my crystal ball...',
  'the deeper waters take a moment.',
  'i am listening for what the cards have not said yet.',
  'patience — the spirits are slow tonight.',
  'let me hold this with what came before it.',
  'the pattern is forming. give it room.',
];

const PERSONA_STALLS = [
  'give me a moment to find the words.',
  'mm.',
  'a breath, then i will speak.',
  'let me find the shape of it.',
  'one moment.',
];

export function pickStall(tier: StallTier): string {
  const pool = tier === 'cognition' ? COGNITION_STALLS : PERSONA_STALLS;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? pool[0]!;
}
