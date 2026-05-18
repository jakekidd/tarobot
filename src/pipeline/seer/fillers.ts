// Conversational filler phrases the seer murmurs while we're waiting on a
// blocking LLM call. Chains together so the latency feels like
// thoughtfulness rather than dead air. Each phrase displays for a random
// ~1.5–3s window before a new (non-repeating) one rotates in.

export const FILLERS: readonly string[] = [
  'hmm…',
  'i see…',
  'yes…',
  'mm…',
  'ah…',
  'oh…',
  'wait…',
  'one moment…',
  'closer…',
  'just there…',
  'patience…',
  'soon…',
  'so it goes…',
  'now…',
  'almost…',
  'a thread…',
  'still here…',
  'the cards know…',
];

/** Pick a filler not equal to `prev` (when possible). */
export function pickFiller(prev?: string): string {
  if (FILLERS.length <= 1) return FILLERS[0] ?? '';
  let next: string;
  do {
    next = FILLERS[Math.floor(Math.random() * FILLERS.length)]!;
  } while (next === prev);
  return next;
}

/** Min/max ms a filler stays on screen before the next rotates in. */
export const FILLER_MIN_MS = 1300;
export const FILLER_MAX_MS = 2900;
