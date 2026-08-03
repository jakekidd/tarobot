// The ensemble — the live reading engine (see docs/SESSION-V2.md).
//
// Two tracks that never call each other: BEHAVIOR (the hot path —
// blocking, serialized: driver selects the beat, persona voices it) and
// COGNITION (async — interpreter + profiler fan, the conjector's hunt,
// attention maintaining the frame). Speech runs on the beat grammar:
// structural lines are authored or template-filled with validated
// slots; the model improvises only in reactive tissue.

import type { OracleDeckCard } from '../oracle/deck';
import type { BeatType, DilemmaClass, QuestionFrame, SpreadClass } from './beats';
import type { DilemmaDoc, ElevatedFacet, ProfileEntry } from './profile';

export type EnsembleMode = 'chat' | 'session';

// ---------------------------------------------------------------- scroll

export type Anchor = { turn: number; beat: number };

export type Beat = {
  kind: 'beat';
  speaker: 'oracle' | 'visitor';
  text: string;
  t: number;
  /** which grammar beat produced an oracle line (visitor beats: absent) */
  beatType?: BeatType;
  /** validated template fills, recorded for the mechanical checker */
  fills?: { key: string; text: string }[];
  truncated?: boolean;
};

export type Ev = {
  kind: 'ev';
  ev: 'open' | 'deal' | 'flip' | 'silence' | 'close';
  slot?: number;
  t: number;
};

export type ScrollEntry = Beat | Ev;

// ---------------------------------------------------------------- input

export type InputDoc = {
  id: string;
  name: string;
  md: string;
  updatedAt: number;
};

export type EnsembleInput = {
  mode: EnsembleMode;
  /** optional lab experiment channel; real sessions start BLIND */
  docs: InputDoc[];
  /** given circumstances note for the driver (color, not script) */
  scenario: string;
  taboos?: string[];
};

// ---------------------------------------------------------------- agents

export const AGENT_NAMES = [
  'driver',
  'persona',
  'interpreter',
  'profiler',
  'conjector',
  'attention',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const FAN_AGENTS = ['interpreter', 'profiler'] as const;
export type FanAgent = (typeof FAN_AGENTS)[number];

// ---------------------------------------------------------------- piles

export type PileItem<P> = {
  id: string;
  agent: AgentName;
  anchor: Anchor;
  t: number;
  payload: P;
  /** id of a prior item this one renews — refiling is persistence */
  refreshes?: string;
};

export type Feeling = { emotion: string; toward?: string; because: string };

export type Read = {
  expressing: string;
  thoughts: string[];
  feelings: Feeling[];
  behavior?: string;
  cue: 'press' | 'bank' | 'honor' | 'none';
  /** 3 lucid … 0 word salad — gates the naming and the quest (§8) */
  coherence: 0 | 1 | 2 | 3;
  frame_stale: boolean;
};

export type PilesView = {
  reads: PileItem<Read>[];
  intents: PileItem<Intent>[];
};

// ---------------------------------------------------------------- stages

/** where the session is on the line — derived, never model-decided.
 *  session: intro → deal → reading → naming → closing → closed
 *  chat (lab probe): intro → talk → closing → closed */
export type StageId =
  | 'intro'
  | 'deal'
  | 'reading'
  | 'naming'
  | 'closing'
  | 'talk'
  | 'closed';

// ---------------------------------------------------------------- frame

export type FrameTrigger = 'boot' | 'flip' | 'stale' | 'backstop' | 'deal';

export type Frame = {
  v: number;
  md: string;
  trigger: FrameTrigger;
  t: number;
};

// ---------------------------------------------------------------- intent

/** the driver's output: which beat comes next, and its fill material.
 *  the engine clamps the beat to the menu it offered — structure binds. */
export type Intent = {
  beat: BeatType;
  /** question beats: which frame from the library */
  frame?: QuestionFrame;
  /** question beats: the facet/thread being aimed at */
  target?: string;
  /** rant_bid beats: which authored variant */
  variant?: 'primary' | 'fallback' | 'escape';
  /** read beats: the position job this read serves (stamped by engine) */
  position?: string;
  accomplish: string;
  ammo?: string;
  approx_words: number;
  note: string;
  /** set by the engine when this intent is a fallback, never by the model */
  canned?: boolean;
};

/** the persona's goldilocks pass (F beats) — one call, three takes;
 *  only `spoken` reaches the scroll. */
export type PersonaLine = {
  too_safe: string;
  too_far: string;
  spoken: string;
};

// ---------------------------------------------------------------- economy

export type Economy = {
  budget: number;
  /** visitor share of words over the last RATIO_WINDOW turns */
  ratio: number;
  /** ratio below CARRY_RATIO — the oracle performs */
  carry: boolean;
};

// ---------------------------------------------------------------- events

export type EnsembleEvent =
  | { type: 'open' }
  | { type: 'visitor_line' }
  | { type: 'card_flip'; slot: number; flip_number: number }
  | { type: 'silence' };

// ---------------------------------------------------------------- engine

export type EnsemblePhase = 'idle' | 'live' | 'closed';
export type BusyLayer = 'driver' | 'persona' | null;

export type DrawnCard = { slot: number; card: OracleDeckCard; position: string };

export type EnsembleSnapshot = {
  mode: EnsembleMode;
  phase: EnsemblePhase;
  stage: StageId;
  scroll: readonly ScrollEntry[];
  piles: PilesView;
  frame: Frame;
  frames: readonly Frame[];
  economy: Economy;
  /** empty until the deal — nothing on the table pre-exists the visitor */
  drawn: readonly DrawnCard[];
  spreadClass: SpreadClass | null;
  flipped: readonly number[];
  profile: ProfileEntry[];
  elevated: ElevatedFacet[];
  dilemma: DilemmaDoc;
  dilemmaClass: DilemmaClass | null;
  pendingGuess: string | null;
  namingDelivered: boolean;
  /** latest interpreter coherence read; 3 until evidence says otherwise */
  coherence: 0 | 1 | 2 | 3;
  questionsAsked: number;
  busy: BusyLayer;
  lastIntent: Intent | null;
  fanInFlight: boolean;
  attentionInFlight: boolean;
  error: string | null;
  constants: EnsembleConstants;
};

// ---------------------------------------------------------------- telemetry

/** one model call, captured at the boundary — the lab's inspector reads
 *  these; the exact prompt the model saw is the single most important
 *  debug artifact in the system. */
export type CallRecord = {
  id: string;
  agent: AgentName;
  tier: 'fast' | 'cognition' | 'deep';
  system: string;
  user: string;
  startedAt: number;
  endedAt?: number;
  streamed: string;
  output?: unknown;
  error?: string;
};

export type EnsembleTelemetry = {
  onCallStart?: (call: CallRecord) => void;
  onCallChunk?: (id: string, chunk: string) => void;
  onCallEnd?: (id: string, output: unknown) => void;
  onCallError?: (id: string, error: string) => void;
};

// ---------------------------------------------------------------- constants

export type EnsembleConstants = {
  WORD_MAX: number;
  FILL_K: number;
  SILENCE_FILL: number;
  /** a flip buys the oracle room to actually read the card */
  FLIP_FILL: number;
  START_BUDGET: number;
  CAP_MIN: number;
  CAP_MAX: number;
  /** carry keys on ABSOLUTE visitor underfeeding (exp01 finding) */
  CARRY_VISITOR_WORDS: number;
  CARRY_WINDOW: number;
  RATIO_WINDOW: number;
  CARRY_CAP_MIN: number;
  AMMO_MAX_WORDS: number;
  /** unspent interpreter thoughts past this count nudge the driver */
  BANKED_THOUGHTS: number;
  /** intro template questions before the deal is mandated */
  QUESTION_BUDGET: number;
  /** beats of grace after naming conditions turn true before it is forced */
  NAMING_GRACE_BEATS: number;
  /** naming and quest require coherence at or above this (§8) */
  COHERENCE_GATE: number;
  /** the conjector wakes on the first visitor turn this many words long */
  CONJECTOR_WAKE_WORDS: number;
  /** tissue beats: free-generation word cap */
  TISSUE_CAP: number;
  FAN_MIN_NEW_WORDS: number;
  FAN_BACKSTOP_TURNS: number;
  FAN_BLOCKING: boolean;
  FRAME_BACKSTOP_TURNS: number;
  FRAME_MAX_WORDS: number;
  TAIL_READS: number;
  BEATS_WINDOW_DRIVER: number;
  BEATS_WINDOW_ATTN: number;
  FAN_DELTA_OVERLAP: number;
};

export const ENSEMBLE_CONSTANTS: EnsembleConstants = {
  WORD_MAX: 60,
  FILL_K: 8,
  SILENCE_FILL: 3,
  FLIP_FILL: 25,
  START_BUDGET: 20,
  CAP_MIN: 10,
  CAP_MAX: 40,
  CARRY_VISITOR_WORDS: 8,
  CARRY_WINDOW: 3,
  RATIO_WINDOW: 6,
  CARRY_CAP_MIN: 20,
  AMMO_MAX_WORDS: 12,
  BANKED_THOUGHTS: 3,
  QUESTION_BUDGET: 4,
  NAMING_GRACE_BEATS: 2,
  COHERENCE_GATE: 2,
  CONJECTOR_WAKE_WORDS: 15,
  TISSUE_CAP: 8,
  FAN_MIN_NEW_WORDS: 12,
  FAN_BACKSTOP_TURNS: 2,
  FAN_BLOCKING: false,
  FRAME_BACKSTOP_TURNS: 4,
  FRAME_MAX_WORDS: 250,
  TAIL_READS: 3,
  BEATS_WINDOW_DRIVER: 8,
  BEATS_WINDOW_ATTN: 12,
  FAN_DELTA_OVERLAP: 2,
};

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
