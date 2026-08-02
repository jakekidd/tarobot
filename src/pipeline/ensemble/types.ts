// The ensemble — the live reading engine (see docs/ENSEMBLE.md).
//
// Two tracks that never call each other: BEHAVIOR (the hot path —
// blocking, serialized: driver decides, persona speaks) and COGNITION
// (async — the two-agent fan filing into detached piles, and attention
// maintaining the frame). The scroll is the pure record of what
// happened in the room; nothing cognitive attaches to it.

import type { OracleDeckCard } from '../oracle/deck';
import type { DilemmaDoc, ElevatedFacet, ProfileEntry } from './profile';

export type EnsembleMode = 'chat' | 'session';

// ---------------------------------------------------------------- scroll

export type Anchor = { turn: number; beat: number };

export type Beat = {
  kind: 'beat';
  speaker: 'oracle' | 'visitor';
  text: string;
  t: number;
  truncated?: boolean;
};

export type Ev = {
  kind: 'ev';
  ev: 'open' | 'flip' | 'silence' | 'close';
  slot?: 1 | 2 | 3 | 4;
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
  /** optional lab experiment channel; real sessions start BLIND —
   *  the profiler builds the picture in-session */
  docs: InputDoc[];
  /** turn-0 given circumstances + instruction; drives the `open` event */
  scenario: string;
  /** the scripted opening speech (see greeting.ts) — spoken verbatim,
   *  no model call. absent/empty falls back to generating the opening
   *  through the hot path with `scenario` as the event. */
  greeting?: string;
  taboos?: string[];
};

// ---------------------------------------------------------------- agents

// the whittled cast (2026-08-02): psychic merged into the interpreter
// (they filed the same `thoughts`), detective / joker / cassandra /
// judge pruned — none of their filings changed what the driver did,
// and every fan call is latency the driver must wade through.
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
  frame_stale: boolean;
};

export type PilesView = {
  reads: PileItem<Read>[];
  intents: PileItem<Intent>[];
};

// ---------------------------------------------------------------- stages

/** where the session is on the line — derived, never model-decided.
 *  session runs opening → table → card_1..4 → closing → closed; chat
 *  runs opening → talk → closed. derivation + goal ladders: stages.ts */
export type StageId =
  | 'opening'
  | 'table'
  | 'card_1'
  | 'card_2'
  | 'card_3'
  | 'card_4'
  | 'closing'
  | 'talk'
  | 'closed';

// ---------------------------------------------------------------- frame

export type FrameTrigger = 'boot' | 'flip' | 'stale' | 'backstop';

export type Frame = {
  v: number;
  md: string;
  trigger: FrameTrigger;
  t: number;
};

// ---------------------------------------------------------------- intent

export const ENSEMBLE_MOVES = [
  'hold',
  'press',
  'bank',
  'honor',
  'reflect',
  'read',
  'respond',
  'stall',
  'close',
] as const;
export type EnsembleMove = (typeof ENSEMBLE_MOVES)[number];

export const STALL_KINDS = [
  'reflect_back',
  'question_direct',
  'confirm_feeling',
  'question_detail',
  'observation',
  'invite',
] as const;
export type StallKind = (typeof STALL_KINDS)[number];

export type Intent = {
  move: EnsembleMove;
  thread: string;
  accomplish: string;
  ammo?: string;
  approx_words: number;
  note: string;
  stall_kind?: StallKind;
  /** set by the engine when this intent is a fallback, never by the model */
  canned?: boolean;
};

/** the persona's goldilocks pass — one call, three takes. the first two
 *  are deliberately wrong (too_safe: the polite machine; too_far: the
 *  boardwalk fortune teller) so the third has walls to land between.
 *  only `spoken` ever reaches the scroll; the drafts are lab evidence.
 *  this replaces the Hand from ENSEMBLE-PLAN (candidate generation +
 *  selection as separate agents) at a fraction of the cost. */
export type PersonaLine = {
  too_safe: string;
  too_far: string;
  spoken: string;
};

/** outstanding debt from a stall — the next driver call must deliver */
export type StallDebt = {
  accomplish: string;
  kind: StallKind;
  consecutive: number;
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
  | { type: 'card_flip'; slot: 1 | 2 | 3 | 4; flip_number: number; guide: string }
  | { type: 'silence' };

// ---------------------------------------------------------------- engine

export type EnsemblePhase = 'idle' | 'live' | 'closed';
export type BusyLayer = 'driver' | 'persona' | null;

export type EnsembleSnapshot = {
  mode: EnsembleMode;
  phase: EnsemblePhase;
  stage: StageId;
  scroll: readonly ScrollEntry[];
  piles: PilesView;
  frame: Frame;
  frames: readonly Frame[];
  economy: Economy;
  flipped: readonly number[];
  /** the four cards the engine drew at start, slots 1-4 */
  drawn: readonly { slot: 1 | 2 | 3 | 4; card: OracleDeckCard }[];
  profile: ProfileEntry[];
  elevated: ElevatedFacet[];
  dilemma: DilemmaDoc;
  pendingGuess: string | null;
  busy: BusyLayer;
  lastIntent: Intent | null;
  stallDebt: StallDebt | null;
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
  /** a flip buys the oracle room to actually read the card — without it,
   *  card reads get paced like small talk */
  FLIP_FILL: number;
  START_BUDGET: number;
  CAP_MIN: number;
  CAP_MAX: number;
  /** carry keys on ABSOLUTE visitor underfeeding (mean words over the
   *  last CARRY_WINDOW visitor beats), never on word-share: share-based
   *  carry was a feedback loop — oracle verbosity lowered the visitor's
   *  share, tripping carry, licensing more oracle words (exp01 finding) */
  CARRY_VISITOR_WORDS: number;
  CARRY_WINDOW: number;
  RATIO_WINDOW: number;
  CARRY_CAP_MIN: number;
  AMMO_MAX_WORDS: number;
  /** unspent interpreter thoughts pile up; at this count the driver is
   *  nudged that banked material is ripe — accumulation should trigger
   *  spending, not just storage */
  BANKED_THOUGHTS: number;
  /** the conjector wakes when the profile has this many facets filled,
   *  or the visitor has taken this many turns — whichever first */
  CONJECTOR_WAKE_FACETS: number;
  CONJECTOR_WAKE_TURNS: number;
  FAN_MIN_NEW_WORDS: number;
  FAN_BACKSTOP_TURNS: number;
  FAN_BLOCKING: boolean;
  FRAME_BACKSTOP_TURNS: number;
  FRAME_MAX_WORDS: number;
  STALL_MAX_CONSECUTIVE: number;
  STALL_WEIGHTS: Record<StallKind, number>;
  TAIL_READS: number;
  LEDGER_CAP: number;
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
  CONJECTOR_WAKE_FACETS: 4,
  CONJECTOR_WAKE_TURNS: 4,
  FAN_MIN_NEW_WORDS: 12,
  FAN_BACKSTOP_TURNS: 2,
  FAN_BLOCKING: false,
  FRAME_BACKSTOP_TURNS: 4,
  FRAME_MAX_WORDS: 250,
  STALL_MAX_CONSECUTIVE: 1,
  STALL_WEIGHTS: {
    reflect_back: 3,
    question_direct: 3,
    confirm_feeling: 2,
    question_detail: 2,
    observation: 2,
    invite: 1,
  },
  TAIL_READS: 3,
  LEDGER_CAP: 20,
  BEATS_WINDOW_DRIVER: 8,
  BEATS_WINDOW_ATTN: 12,
  FAN_DELTA_OVERLAP: 2,
};

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
