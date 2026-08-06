// The classification layer — what the eyes are DOING, named in terms
// the session already uses, so nothing upstream has to know a shader
// mode exists. The show says "she is asking a question"; this decides
// that means the spiral.
//
// Deliberately free of any pipeline import: the mapping from beat
// names is a plain record, so the leyebrary stays portable to Node
// and to whatever the next engine calls its beats.

import type { LookName } from './looks';

/** what a spoken line is FOR — the axis that should move the eyes */
export type SpeechIntent = 'greet' | 'probe' | 'reveal' | 'name' | 'close' | 'hold';

export type EyeMood =
  | { kind: 'listening' }
  | { kind: 'thinking' }
  | { kind: 'speaking'; intent: SpeechIntent }
  | { kind: 'closed' };

/**
 * The 15 grammar beats collapse onto 6 intents. The collapse is the
 * point: a beat type is a production-grammar concept, and there is no
 * reason the eyes should have 15 states. What matters visually is
 * whether she is hunting, showing, blessing, or leaving.
 */
export const BEAT_INTENT: Record<string, SpeechIntent> = {
  greeting: 'greet',
  // the hunt — she is looking for something in you
  question: 'probe',
  guess: 'probe',
  rant_bid: 'probe',
  focus: 'probe',
  // the investigator's conversation turn (offer-loop intake): fishing
  talk: 'probe',
  // the turn — something is being put in front of you
  deal: 'reveal',
  flip_invite: 'reveal',
  read: 'reveal',
  // the personal register — your name, your flower, your charm
  naming: 'name',
  honor: 'name',
  charm: 'name',
  // the leaving
  quest: 'close',
  close: 'close',
  // holding the room open
  hold: 'hold',
  tissue: 'hold',
};

export function intentOfBeat(beat: string | null | undefined): SpeechIntent {
  if (!beat) return 'hold';
  return BEAT_INTENT[beat] ?? 'hold';
}

const SPEAKING_LOOK: Record<SpeechIntent, LookName> = {
  // the session's own seeded flower — she opens as herself
  greet: 'mandala',
  // the spiral searches; it is the OG thinking face, used here because
  // a question IS her reaching
  probe: 'hypnosis',
  // the kaleidoscope burst — something opening out
  reveal: 'prism',
  // back to the flower: the personal beats wear the visitor's own
  // geometry
  name: 'mandala',
  // the tunnel — everything walking inward, the exit
  close: 'descent',
  // the soft register, nothing demanded
  hold: 'ripple',
};

/**
 * While thinking, the eyes must not sit still — a frozen face during
 * a long model call reads as a hang. They drift through the three
 * looks that are ABOUT interiority: the hallucination engine, the
 * feedback loop, the counter-rotation. THINK_DWELL is how long each
 * holds before morphing on.
 */
export const THINKING_CYCLE: LookName[] = ['vision', 'trails', 'pinna'];
export const THINK_DWELL = 7.5;

export function thinkingLook(elapsed: number): LookName {
  const i = Math.floor(Math.max(0, elapsed) / THINK_DWELL) % THINKING_CYCLE.length;
  return THINKING_CYCLE[i];
}

/**
 * The whole mapping, in one call. `elapsed` is seconds spent in the
 * CURRENT mood (only the thinking cycle reads it).
 */
export function moodLook(mood: EyeMood, elapsed = 0): LookName {
  switch (mood.kind) {
    case 'thinking':
      return thinkingLook(elapsed);
    case 'speaking':
      return SPEAKING_LOOK[mood.intent];
    case 'closed':
      return 'descent';
    case 'listening':
    default:
      // idle is the quietest thing in the library — she is not
      // performing at you while you type
      return 'nebula';
  }
}

/** crossfade time into a mood. thought snaps; everything else eases. */
export function moodFade(mood: EyeMood): number {
  switch (mood.kind) {
    case 'thinking':
      return 0.7;
    case 'speaking':
      return mood.intent === 'reveal' ? 0.5 : 1.3;
    case 'closed':
      return 2.5;
    default:
      return 1.8;
  }
}

/** breath depth by mood — she breathes deeper while under */
export function moodBreath(mood: EyeMood): number {
  switch (mood.kind) {
    case 'thinking':
      return 2.2;
    case 'closed':
      return 0.5;
    default:
      return 1;
  }
}

export function sameMood(a: EyeMood, b: EyeMood): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'speaking' && b.kind === 'speaking') return a.intent === b.intent;
  return true;
}
