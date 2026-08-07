// The beat grammar — SESSION-V2 §3. Every oracle line belongs to a beat
// type; each type has a generation mode: V (authored, spoken as written),
// T (authored skeleton, typed slots, validated fills), F (free persona
// generation — reactive tissue only). Fabricated quotes are impossible
// by construction: quotes exist only as mechanically verified slots.

import BEATS_RAW from '../../../materials/ensemble/beats.json?raw';
import { countWords } from './types';

export const BEAT_TYPES = [
  'greeting',
  'rant_bid',
  'question',
  'tissue',
  'deal',
  'flip_invite',
  'read',
  'guess',
  'naming',
  'focus',
  'honor',
  'quest',
  'charm',
  'close',
  'hold',
  'talk',
] as const;
export type BeatType = (typeof BEAT_TYPES)[number];

export type GenMode = 'V' | 'T' | 'F';

/** structural beats are never FREE (law 1) */
export const BEAT_MODE: Record<BeatType, GenMode> = {
  focus: 'T',
  greeting: 'V',
  rant_bid: 'V', // authored variants; slot-free, so V at render time
  question: 'T',
  tissue: 'F',
  talk: 'F', // the investigator's conversation turn (offer-loop intake)
  deal: 'T',
  flip_invite: 'V',
  read: 'F',
  guess: 'T',
  naming: 'T',
  honor: 'F',
  quest: 'T',
  charm: 'T',
  close: 'V',
  hold: 'V',
};

export const QUESTION_FRAMES = ['THREAD', 'KIND', 'CONCRETE', 'STAKES', 'MIRROR'] as const;
export type QuestionFrame = (typeof QUESTION_FRAMES)[number];

export const DILEMMA_CLASSES = ['FORK', 'THRESHOLD', 'LOOP', 'WEIGHT'] as const;
export type DilemmaClass = (typeof DILEMMA_CLASSES)[number];
/** UNKNOWN is the fallback spread key, never a committed class */
export type SpreadClass = DilemmaClass | 'UNKNOWN' | 'EXPLORATION';

type FrameEntry = { text: string; fallback?: string };

type BeatsFile = {
  greeting: { variants: string[] };
  rant_bid: { primary: string; fallback: string; escape: string };
  question_frames: Record<QuestionFrame, FrameEntry>;
  deal: Record<SpreadClass, FrameEntry>;
  flip_invite: { variants: string[] };
  guess: { text: string };
  focus: { offer: string; alt: string };
  handles: string[];
  /** the promotion exit of the fossil law: lines good enough to keep
   *  graduate INTO authored banks (echoing is legal there — it's the
   *  act), instead of dying on the never-say list. host lines are
   *  handed to the investigator during a drought as her own book. */
  host: string[];
  _never_say: string[];
  naming: { incantations: Record<DilemmaClass, string>; release: string };
  quest: { lead: string; text: string };
  charm: FrameEntry;
  close: { variants: string[] };
};

export const BEATS: BeatsFile = JSON.parse(BEATS_RAW) as BeatsFile;

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const BEATS_HASH = djb2(BEATS_RAW);
export { djb2 };

/** the fossil law: retired/example lines no oracle beat may contain */
export const NEVER_SAY: string[] = BEATS._never_say.map((s) => s.toLowerCase());
export const NEVER_SAY_LOWER = NEVER_SAY;

export function violatesNeverSay(line: string): string | null {
  const l = line.toLowerCase();
  for (const phrase of NEVER_SAY) if (l.includes(phrase)) return phrase;
  return null;
}

// ---------------------------------------------------------------- slots

export type SlotSpec = {
  /** stable key: TYPE_index among same-type slots in the skeleton */
  key: string;
  type: 'QUOTE' | 'NAME' | 'NOUN' | 'CLAUSE' | 'GUESS' | 'PASSAGE';
  /** word cap for NOUN/CLAUSE; passage name for PASSAGE */
  arg?: string;
  /** raw token as it appears in the skeleton */
  token: string;
};

const SLOT_RE = /\{(QUOTE|NAME|NOUN|CLAUSE|GUESS|PASSAGE)(?::([a-z0-9_]+))?\}/g;

export function parseSlots(skeleton: string): SlotSpec[] {
  const out: SlotSpec[] = [];
  const counts = new Map<string, number>();
  for (const m of skeleton.matchAll(SLOT_RE)) {
    const type = m[1] as SlotSpec['type'];
    const n = counts.get(type) ?? 0;
    counts.set(type, n + 1);
    out.push({ key: `${type}_${n}`, type, arg: m[2], token: m[0] });
  }
  return out;
}

/** slots the persona fills (vs engine-substituted GUESS/PASSAGE) */
export function fillableSlots(slots: SlotSpec[]): SlotSpec[] {
  return slots.filter((s) => s.type !== 'GUESS' && s.type !== 'PASSAGE');
}

export type SlotFills = Record<string, string>;

export type SlotFailure = { key: string; reason: string };

/** mechanical validation — the load-bearing defense. QUOTE must be an
 *  exact (case-insensitive) substring of what the visitor actually
 *  said; NOUN/CLAUSE respect their word caps. */
export function validateFills(
  slots: SlotSpec[],
  fills: SlotFills,
  visitorText: string,
): SlotFailure[] {
  const failures: SlotFailure[] = [];
  const haystack = visitorText.toLowerCase();
  for (const slot of fillableSlots(slots)) {
    const fill = (fills[slot.key] ?? '').trim();
    if (!fill) {
      failures.push({ key: slot.key, reason: 'empty' });
      continue;
    }
    if (slot.type === 'QUOTE' && !haystack.includes(fill.toLowerCase())) {
      failures.push({ key: slot.key, reason: 'not a substring of visitor turns' });
    }
    if ((slot.type === 'NOUN' || slot.type === 'CLAUSE') && slot.arg) {
      const cap = Number(slot.arg);
      if (Number.isFinite(cap) && countWords(fill) > cap) {
        failures.push({ key: slot.key, reason: `over ${cap} words` });
      }
    }
  }
  return failures;
}

export function assemble(
  skeleton: string,
  fills: SlotFills,
  engine: { guess?: string; passages?: Record<string, string> },
): string {
  const counts = new Map<string, number>();
  return skeleton.replace(SLOT_RE, (token, type: string, arg?: string) => {
    const n = counts.get(type) ?? 0;
    counts.set(type, n + 1);
    if (type === 'GUESS') return engine.guess ?? token;
    if (type === 'PASSAGE') return engine.passages?.[arg ?? ''] ?? token;
    return fills[`${type}_${n}`] ?? token;
  });
}

/** cap a passage to n sentences (the quest frame's backstop) */
export function capSentences(text: string, n: number): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!parts || parts.length <= n) return text.trim();
  return parts.slice(0, n).join('').trim();
}

// ---------------------------------------------------------------- spreads

export type SpreadPosition = { job: string };
export type Spread = { key: SpreadClass; name: string; positions: SpreadPosition[] };

export const SPREADS: Record<SpreadClass, Spread> = {
  FORK: {
    key: 'FORK',
    name: 'the crossing',
    positions: [
      { job: 'what you carry in' },
      { job: 'road one' },
      { job: 'road two' },
      { job: 'what tips it' },
    ],
  },
  THRESHOLD: {
    key: 'THRESHOLD',
    name: 'the door',
    positions: [
      { job: "the thing you've decided" },
      { job: 'what the waiting costs' },
      { job: 'the first step' },
    ],
  },
  LOOP: {
    key: 'LOOP',
    name: 'the wheel',
    positions: [
      { job: 'the loop itself' },
      { job: 'your move inside it' },
      { job: 'what it protects you from' },
      { job: 'the way off' },
    ],
  },
  WEIGHT: {
    key: 'WEIGHT',
    name: 'the load',
    positions: [
      { job: 'the thing you carry' },
      { job: 'what carrying it buys' },
      { job: 'what it costs' },
      { job: 'whose it really is' },
    ],
  },
  EXPLORATION: {
    key: 'EXPLORATION',
    name: 'mind-heart-root',
    positions: [{ job: 'your mind' }, { job: 'your heart' }, { job: 'your root' }],
  },
  UNKNOWN: {
    key: 'UNKNOWN',
    name: 'the weather',
    positions: [
      { job: 'where you are' },
      { job: "what's moving" },
      { job: "what's still" },
    ],
  },
};
