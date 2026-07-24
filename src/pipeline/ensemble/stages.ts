// Stages — the train line. Where the session is, derived from the
// scroll and the flips; no model call decides this. The driver reads
// the current stage's goal ladder (P0 highest) so the robot always has
// a direction even in chat-from-zero; the lab lights the current stop.

import type { EnsembleMode, EnsemblePhase, ScrollEntry, StageId } from './types';

export function deriveStage(args: {
  mode: EnsembleMode;
  scroll: readonly ScrollEntry[];
  flippedCount: number;
  phase: EnsemblePhase;
}): StageId {
  const { mode, scroll, flippedCount, phase } = args;
  if (phase === 'closed') return 'closed';
  const visitorSpoke = scroll.some((e) => e.kind === 'beat' && e.speaker === 'visitor');

  if (mode === 'chat') {
    return visitorSpoke ? 'talk' : 'opening';
  }

  if (flippedCount === 0) return visitorSpoke ? 'table' : 'opening';
  if (flippedCount < 4) return `card_${flippedCount}` as StageId;

  // fourth card flipped: it is 'card_4' until its read lands, then the
  // session is in closing posture (a flip always earns its read first)
  const lastFlipIdx = scroll.reduce(
    (idx, e, i) => (e.kind === 'ev' && e.ev === 'flip' ? i : idx),
    -1,
  );
  const readDelivered = scroll.some(
    (e, i) => i > lastFlipIdx && e.kind === 'beat' && e.speaker === 'oracle',
  );
  return readDelivered ? 'closing' : 'card_4';
}

// ---------------------------------------------------------------- goals

const SESSION_GOALS: Record<StageId, string[]> = {
  opening: [
    'P0 land them in the room; zero demands, zero questions about why they came',
    'P1 let them find their own reason to speak first',
    'P2 the cards wait; never sell them',
  ],
  table: [
    'P0 learn what they walked in carrying — their words, not the docs',
    'P1 warm the room until flipping feels like their idea',
    'P2 bank anything that lands; it is fuel for the cards',
  ],
  card_1: [
    'P0 read the flipped card against this person, not in general',
    'P1 the first read ends with a way out: tell me if that is not it',
    'P2 hold the pace; three cards still wait',
  ],
  card_2: [
    'P0 read it against what the first card stirred up',
    'P1 press where the two cards disagree',
    'P2 keep the question under the question warm, not spoken',
  ],
  card_3: [
    'P0 the question under the question surfaces here — say the shape of it',
    'P1 read the card as one road held against the other',
    'P2 leave the fourth card wanted',
  ],
  card_4: [
    'P0 read the last card into what is now unavoidable',
    'P1 let them have their moment with it; never close on the flip itself',
    'P2 gather what the close will spend',
  ],
  closing: [
    'P0 close while it still means something; the mantra is the last thing they hear',
    'P1 no new territory; spend only what is banked',
    'P2 an ending held open goes stale — end it',
  ],
  talk: [],
  closed: [],
};

const CHAT_GOALS: Record<StageId, string[]> = {
  ...SESSION_GOALS,
  opening: [
    'P0 land them in the room; zero demands',
    'P1 give them a floor worth stepping onto',
  ],
  talk: [
    'P0 find why they came — the fork under the small talk',
    'P1 name what they are carrying, one thing at a time; watch what it does',
    'P2 return the floor; the best material is theirs, not yours',
  ],
};

export function stageGoals(mode: EnsembleMode, stage: StageId): string[] {
  return (mode === 'chat' ? CHAT_GOALS : SESSION_GOALS)[stage] ?? [];
}

// ------------------------------------------------------------- the line

export type Stop = { id: StageId; label: string };

export const SESSION_STOPS: Stop[] = [
  { id: 'opening', label: 'opening' },
  { id: 'table', label: 'the table' },
  { id: 'card_1', label: 'i' },
  { id: 'card_2', label: 'ii' },
  { id: 'card_3', label: 'iii' },
  { id: 'card_4', label: 'iv' },
  { id: 'closing', label: 'the close' },
];

export const CHAT_STOPS: Stop[] = [
  { id: 'opening', label: 'opening' },
  { id: 'talk', label: 'the talk' },
  { id: 'closing', label: 'the close' },
];

/** which stop the stage lights; 'closed' parks on the final stop */
export function stopIndex(mode: EnsembleMode, stage: StageId): number {
  const stops = mode === 'chat' ? CHAT_STOPS : SESSION_STOPS;
  if (stage === 'closed' || stage === 'closing') return stops.length - 1;
  const i = stops.findIndex((s) => s.id === stage);
  return i === -1 ? 0 : i;
}
