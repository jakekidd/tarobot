// The Oracle baseline — the single-voice reading loop from the spec's MVP:
// one frozen Brief in, a Scroll of beats + director notes as the only live
// state, a word budget that fills by listening and empties by speaking, and
// two calls per beat (director decides, voice performs). This is the
// baseline every later ensemble stage (the Hand, the cognition pool) must
// beat on a real reading before it earns its cost.

export type OracleMode = 'session' | 'chat';

export type OracleFork = {
  /** the question they would say out loud */
  surface: string;
  /** the question under it */
  reframe: string;
};

export type OracleCard = {
  /** deck id from materials/oracle/deck.json */
  id: string;
  name: string;
  slot: 1 | 2 | 3 | 4;
  /** delivery guide, written as if this card could be flipped first */
  guide: string;
};

export type OracleBrief = {
  name?: string;
  companion?: string;
  portrait: string;
  fork: OracleFork | null;
  leads: string[];
  /** 4 in session mode; empty in chat mode */
  cards: OracleCard[];
  /** first line, spoken before any card */
  opening: string;
  /** the carry-out sentence; the close move lands it */
  mantra: string;
  taboos: string[];
};

export type Beat = { kind: 'beat'; speaker: 'oracle' | 'visitor'; text: string; t: number };
/** director-private observation — the Scroll's one non-spoken channel */
export type Note = { kind: 'note'; text: string; t: number };
export type ScrollEntry = Beat | Note;

export type OracleEvent =
  | { type: 'visitor_line' }
  | { type: 'card_flip'; slot: number; flip_number: number; guide: string }
  | { type: 'silence' };

export const MOVES = [
  'hold',
  'press',
  'bank',
  'honor',
  'reflect',
  'read',
  'close',
  'respond',
] as const;
export type Move = (typeof MOVES)[number];

export type DirectorSet = {
  move: Move;
  intent: string;
  note: string;
  approx_words: number;
};

export type OraclePhase = 'idle' | 'live' | 'closed';
export type AwaitingLayer = 'director' | 'voice' | null;

export type OracleSnapshot = {
  mode: OracleMode;
  phase: OraclePhase;
  scroll: readonly ScrollEntry[];
  budget: number;
  /** slots flipped so far, in flip order */
  flipped: readonly number[];
  busy: AwaitingLayer;
  lastSet: DirectorSet | null;
  error: string | null;
};

/** intake shape for the compile path — the 60-90 second mini-intake */
export type MiniIntake = {
  name?: string;
  /** how has the year treated you */
  year: string;
  /** what is circling */
  circling: string;
  /** who is on your mind (name or role) */
  who?: string;
  off_limits?: string;
  /** say anything you want the cards to know */
  free_line?: string;
};

/** tuning constants — starting values per the spec, overridable per engine */
export type OracleConstants = {
  WORD_MAX: number;
  FILL_K: number;
  SILENCE_FILL: number;
  CAP_MIN: number;
  CAP_MAX: number;
  START_BUDGET: number;
};

export const ORACLE_CONSTANTS: OracleConstants = {
  WORD_MAX: 60,
  FILL_K: 8,
  SILENCE_FILL: 3,
  CAP_MIN: 10,
  CAP_MAX: 40,
  START_BUDGET: 20,
};

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
