// Stages — the train line, v2. Where the session is, derived from the
// scroll; no model call decides this. Goal ladders orient the driver's
// F beats and question aim; the beat grammar (beats.ts) is what binds.

import type { EnsembleMode, EnsemblePhase, ScrollEntry, StageId } from './types';

export function deriveStage(args: {
  mode: EnsembleMode;
  scroll: readonly ScrollEntry[];
  dealt: boolean;
  flippedCount: number;
  spreadSize: number;
  namingDelivered: boolean;
  phase: EnsemblePhase;
}): StageId {
  const { mode, scroll, dealt, flippedCount, spreadSize, namingDelivered, phase } = args;
  if (phase === 'closed') return 'closed';

  if (mode === 'chat') {
    const visitorSpoke = scroll.some((e) => e.kind === 'beat' && e.speaker === 'visitor');
    if (!visitorSpoke) return 'intro';
    return namingDelivered ? 'closing' : 'talk';
  }

  if (!dealt) return 'intro';
  if (flippedCount === 0) return 'deal';
  if (namingDelivered) {
    return flippedCount >= spreadSize ? 'closing' : 'naming';
  }
  return 'reading';
}

// ---------------------------------------------------------------- goals

const GOALS: Record<StageId, string[]> = {
  intro: [
    'P0 this is intake: the rant first, then one aimed question at a time',
    'P1 every question earns its place — follow the charge, not the checklist',
    'P2 tissue between questions; let answers finish landing before the next',
  ],
  deal: [
    'P0 the spread is dealt; invite the first flip and get out of the way',
  ],
  reading: [
    'P0 reads GATHER here: surface material, aim the position job at this person',
    'P1 a pending guess is a terrible thing to waste — play it while cards are live',
    'P2 leave the remaining cards wanted',
  ],
  naming: [
    'P0 the naming has been spoken: reads now APPLY — aim each card at the named fork',
    'P1 let them argue with the naming if they want to; the document can take it',
  ],
  closing: [
    'P0 close while it still means something; the quest is the last thing they hear',
    'P1 no new territory; spend only what is banked',
    'P2 an ending held open goes stale — end it',
  ],
  talk: [
    'P0 find why they came — the fork under the small talk',
    'P1 name what they are carrying, one thing at a time; watch what it does',
    'P2 return the floor; the best material is theirs, not yours',
  ],
  closed: [],
};

export function stageGoals(_mode: EnsembleMode, stage: StageId): string[] {
  return GOALS[stage] ?? [];
}

// ------------------------------------------------------------- the line

export type Stop = { id: StageId; label: string };

export const SESSION_STOPS: Stop[] = [
  { id: 'intro', label: 'the rant' },
  { id: 'deal', label: 'the deal' },
  { id: 'reading', label: 'the reading' },
  { id: 'naming', label: 'the naming' },
  { id: 'closing', label: 'the close' },
];

export const CHAT_STOPS: Stop[] = [
  { id: 'intro', label: 'opening' },
  { id: 'talk', label: 'the talk' },
  { id: 'closing', label: 'the close' },
];

/** which stop the stage lights; 'closed' parks on the final stop */
export function stopIndex(mode: EnsembleMode, stage: StageId): number {
  const stops = mode === 'chat' ? CHAT_STOPS : SESSION_STOPS;
  if (stage === 'closed') return stops.length - 1;
  const i = stops.findIndex((s) => s.id === stage);
  return i === -1 ? 0 : i;
}
