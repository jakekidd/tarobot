// Survey engine types. Internal to the survey module; the engine produces a
// CompilerOutput at close that maps back to the legacy Profile/Question shape
// the tent consumes (so the rest of the app doesn't need to change).

import type { Profile, Question } from '../types';

// ─── Phase ──────────────────────────────────────────────

export type Phase = 'A' | 'B' | 'C' | 'D' | 'E';
export const PHASE_ORDER: Phase[] = ['A', 'B', 'C', 'D', 'E'];

// ─── Dialogue tree ──────────────────────────────────────

// Question formats. `multi` was dropped — collapsed to `choice` (single
// select). `binary` ALWAYS resolves to [yes, no, sometimes] regardless
// of the node's `a` field; investigator can't alter binary options.
export type AnswerFormat = 'text' | 'date' | 'choice' | 'binary' | 'matrix';

/** [answer_text] | [answer_text, comment]. Comment is shown inline after pick. */
export type AnswerTuple = [string] | [string, string];

export type TreeNode = {
  /** Which topic group this node belongs to. Must be one of `tree.topics`. */
  topic: string;
  q: string;
  f: AnswerFormat;
  a?: AnswerTuple[];
  axes?: [[string, string], [string, string]];
};

export type DialogueTree = {
  v: string;
  /** Ordered list of topic ids the editor groups nodes by. */
  topics: string[];
  /** Openers (in order) — always run first; not investigator-picked. */
  openers: string[];
  nodes: Record<string, TreeNode>;
  interp: Record<string, string>;
};

/** Question rendered for the UI: post-substitution, options flattened. */
export type RenderedQuestion = {
  node_id: string;
  text: string;
  format: AnswerFormat;
  options: string[];
  axes?: [[string, string], [string, string]];
  preamble?: string;
};

// ─── Survey profile (richer than legacy Profile) ────────

export type Note = {
  text: string;
  category: 'observation' | 'suspicion' | 'gossip_flag' | 'confirmed_thread' | 'ground_truth';
  source_picks: string[];
  confidence: 'low' | 'medium' | 'high';
  created_at: number;
};

export type CastMember = {
  label: string;
  likely_role?: string;
  supporting_picks: string[];
  confidence: 'low' | 'medium' | 'high';
};

export type Choice = {
  fork: string;
  fork_a: { label: string; supporting_picks: string[]; pull_weight: number };
  fork_b: { label: string; supporting_picks: string[]; pull_weight: number };
  is_stated: boolean;
  is_constructed: boolean;
  stakes_domain: 'relational' | 'occupational' | 'identity' | 'geographic' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  open_questions: string[];
};

export type Hypothesis = {
  id: string;
  description: string;
  supporting_picks: string[];
  contradicting_picks: string[];
  confidence: number;            // 0-1
  status: 'inferred' | 'testing' | 'confirmed' | 'refuted';
};

export type Contradiction = {
  description: string;
  pick_a: string;
  pick_b: string;
  severity: 'minor' | 'notable' | 'load_bearing';
};

export type Hook = {
  description: string;
  source: 'pass' | 'latency_outlier' | 'admission' | 'multi_select_pattern' | 'inferred';
  source_pick?: string;
};

export type ProfileSections = {
  identity: Note[];
  state: Note[];
  relational: Note[];
  self_model: Note[];
  decision_context: Note[];
  patterns: Note[];
};

export type SurveyProfile = {
  // Populated deterministically from openers
  name: string;
  birthday: { year: number; month: number; day: number } | null;
  sun_sign: string | null;
  life_path: number | null;
  birth_card: { number: number; name: string } | null;
  age_bracket: string | null;
  birth_time_bracket: 'morning' | 'afternoon_evening' | 'overnight' | 'unknown' | null;
  has_question_mode: 'specific' | 'general' | 'not_really' | 'not_sure' | null;

  // Populated by the Observer
  sections: ProfileSections;
  cast: CastMember[];
};

/** The "Clue tools" — everything the Detective is actively reasoning
 *  about. Lives separately from Profile (facts about the user) because
 *  this is INFERENCE, not record. The Interrogator reads from here to
 *  pick its next move. */
export type Investigation = {
  hypotheses: Hypothesis[];
  choice_draft: Choice | null;
  contradictions: Contradiction[];
  hooks: Hook[];
  active_threads: ActiveThread[];
  posture: 'warm' | 'careful' | 'direct' | null;
};

// ─── Events ─────────────────────────────────────────────

export type PickEvent = {
  node_id: string;
  question_text: string;       // post-substitution
  options_shown: string[];     // full set shown to user (includes interrogator overrides)
  answer: string | string[];   // string for choice/binary/matrix/text/date
  answered_at: number;
  latency_ms: number;
  prompted_by: string | null;  // thread_id or parent node_id if injected
};

export type TimingEvent = {
  node_id: string;
  rendered_at: number;
  answered_at: number;
  latency_ms: number;
  revisions: number;           // multi-select toggle count before commit
};

// ─── Queue + threads ────────────────────────────────────

export type QueueItem = {
  node_id: string;
  prompted_by: string | null;
  priority: 'normal' | 'high' | 'urgent';
  preamble?: string;
  /** Investigator-supplied override for the `choice`-format options on
   *  this question. Ignored for any other format. */
  options_override?: string[];
};

export type ActiveThread = {
  thread_id: string;
  description: string;
  trigger_picks: string[];
  inject_node_id: string | null;
  confirm_probe_id: string | null;
  status: 'open' | 'awaiting_confirm' | 'confirmed' | 'refuted';
  observer_note?: string;
};

// ─── Engine state ───────────────────────────────────────

export type CloseReason = 'user_exit' | 'queue_exhausted' | 'cap';

export type EngineState = {
  session_id: string;
  started_at: number;
  tree_version: string;

  profile: SurveyProfile;
  investigation: Investigation;     // NEW — the Clue tools live here
  is_returning_user: boolean;
  prior_session_summary?: string;

  queue: QueueItem[];
  picks_log: PickEvent[];
  timing_log: TimingEvent[];
  asked_node_ids: string[];

  heat: number;                  // unused — kept for telemetry/future use
  heat_history: number[];        // unused
  phase: Phase;
  closed: boolean;
  close_reason?: CloseReason;
  /** True while a blocking agent call is in flight. UI uses this to drive the dizzy loading state. */
  thinking: boolean;
};

// ─── Behavioural events (engine-internal, drive heat) ───

export type BehavioralSignals = {
  latency_ms: number;            // for this pick
  rolling_median_ms: number;     // engine's running median over recent picks
  is_pass: boolean;
  is_multi_select: boolean;
  multi_select_count?: number;
  revisions: number;
};

// ─── Pipeline I/O ───────────────────────────────────────
//
// The three agents (Observer → Detective → Interrogator) all share the
// same input shape: a PipelineContext. The engine mutates it as each
// agent runs, so each subsequent agent sees the latest profile +
// investigation.

/** What the Interrogator picks from. */
export type BasketItem = {
  id: string;
  text: string;
  format: AnswerFormat;
  topic: string;
  default_options: string[];      // empty for text/date/matrix
};

export type PipelineContext = {
  /** 1-based turn number — counts post-opener picks only. */
  index: number;
  /** Text of the just-answered question (post-substitution). */
  question: string;
  /** Options actually shown to the user (post-interrogator override). */
  options_shown: string[];
  /** The user's pick. */
  answer: string | string[];
  /** Profile so far — mutated in-place by Observer before passing on. */
  profile: SurveyProfile;
  /** Investigation so far — mutated by Detective before passing to Interrogator. */
  investigation: Investigation;
  /** Full Q&A history, including this turn. Each entry has options_shown + answer. */
  history: PickEvent[];
  /** Questions currently queued AFTER this one (head=next to ask). */
  queue: QueueItem[];
  /** The basket of available unasked questions — what the Interrogator picks from. */
  basket: BasketItem[];
};

/** Observer outputs profile updates. Kept open-ended on purpose: the
 *  Observer chooses what's worth filing, not the schema. */
export type ObserverOutput = {
  notes_to_append: Array<{
    text: string;
    section: keyof ProfileSections;
    category: Note['category'];
    confidence: 'low' | 'medium' | 'high';
    source_picks: string[];        // node_ids
  }>;
  cast_updates: CastMember[];
  /** Private to engine logs — 1-2 sentences on what was filed. */
  reasoning: string;
};

/** Detective updates the Clue tools. Each field is OPTIONAL — only
 *  emit changes. Lists are merged by id where applicable. */
export type DetectiveOutput = {
  hypothesis_updates: Hypothesis[];       // adds or replaces by id
  hypothesis_refutes: string[];           // ids to mark refuted
  choice_update: Choice | null;           // null = no change
  contradictions_found: Contradiction[];
  hooks_found: Hook[];
  thread_updates: Array<{ thread_id: string; status: ActiveThread['status'] }>;
  /** null = no change. otherwise overwrites investigation.posture. */
  posture: 'warm' | 'careful' | 'direct' | null;
  /** Private to engine logs — 2-3 sentences on what's now believed. */
  reasoning: string;
};

/** Interrogator's only job: pick the next question + optional flavor. */
export type InterrogatorOutput = {
  next_question: {
    /** MUST be an id from basket[]. */
    node_id: string;
    /** Optional Clat-voice prefix (rendered above the question text).
     *  Does NOT modify the question text itself. Empty = no preamble. */
    preamble?: string;
    /** Choice-format only. Replaces the default options (can shrink,
     *  reorder, ADD, or substitute). Ignored for binary/matrix/text/date. */
    options_override?: string[];
  };
  /** Private to engine logs — 1-2 sentences on why this pick. */
  reasoning: string;
};

export type CompilerInput = {
  state: EngineState;
};

/**
 * What the LLM contributes at compile time. Kept tight: just the synthesis
 * fields. The engine maps the rest of the legacy Profile from EngineState
 * deterministically — see assembleCompilerOutput() in engine.ts.
 */
export type CompilerLLMOutput = {
  /** 3-6 sentence summary that goes into Profile.brief. */
  brief_summary: string;
  /** The opinionated PI brief the seer reads (200-400 words). */
  prose_brief: string;
  /** Three openers for the reading. Schema-locked to legacy Question shape. */
  openers: Question[];
};

/** Final Compiler payload — legacy Profile + openers + the prose brief. */
export type CompilerOutput = {
  profile: Profile;
  openers: Question[];
  prose_brief: string;
};

// ─── Engine API ─────────────────────────────────────────

export type EngineListener = (state: EngineState) => void;
