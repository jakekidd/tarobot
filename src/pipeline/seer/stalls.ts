// Latency catchphrases. Two pools, keyed by which seer layer the reader
// is currently waiting on. Director pool is for things only cloud Claude
// can answer; actor pool is for the voicing step (eventually local OSS
// LLM). Distinguishing them visually telegraphs which kind of wait the
// user is enduring — and where future optimization will pay off.
//
// Hardcoded for now. The eventual production system may want a way for
// the actor to author its own stall (or to draw from a private bank
// that the user has not heard).

export type StallLayer = 'director' | 'actor';

const DIRECTOR_STALLS = [
  'looking into my crystal ball...',
  'the deeper waters take a moment.',
  'i am listening for what the cards have not said yet.',
  'patience — the spirits are slow tonight.',
  'let me hold this with what came before it.',
  'the pattern is forming. give it room.',
];

const ACTOR_STALLS = [
  'give me a moment to find the words.',
  'mm.',
  'a breath, then i will speak.',
  'let me find the shape of it.',
  'one moment.',
];

export function pickStall(layer: StallLayer): string {
  const pool = layer === 'director' ? DIRECTOR_STALLS : ACTOR_STALLS;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? pool[0]!;
}
