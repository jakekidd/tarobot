// Survey engine types. Internal to the survey module; the engine produces a
// CompilerOutput at close that maps back to the legacy Profile/Question shape
// the tent consumes (so the rest of the app doesn't need to change).

import type { Profile, Question } from '../types';

// ─── Phase ──────────────────────────────────────────────

export type Phase = 'A' | 'B' | 'C' | 'D' | 'E';
export const PHASE_ORDER: Phase[] = ['A', 'B', 'C', 'D', 'E'];

// ─── Dialogue tree ──────────────────────────────────────

export type AnswerFormat = 'text' | 'date' | 'choice' | 'binary' | 'multi' | 'matrix';

/** [answer_text] | [answer_text, comment] | [answer_text, comment, next_node_id]. */
export type AnswerTuple = [string] | [string, string] | [string, string, string];

export type TreeNode = {
  q: string;
  f: AnswerFormat;
  a?: AnswerTuple[];
  axes?: [[string, string], [string, string]];
  is_dark?: boolean;
  next?: string;
};

export type DialogueTree = {
  v: string;
  openers: string[];
  roots: string[];
  nodes: Record<string, TreeNode>;
  interp: Record<string, string>;
};

/** Question rendered for the UI: post-substitution, with options resolved + pass appended for dark. */
export type RenderedQuestion = {
  node_id: string;
  text: string;
  format: AnswerFormat;
  options: string[];
  axes?: [[string, string], [string, string]];
  is_dark: boolean;
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
  contradictions: Contradiction[];
  hooks: Hook[];
  recommended_posture: string | null;
};

// ─── Events ─────────────────────────────────────────────

export type PickEvent = {
  node_id: string;
  question_text: string;       // post-substitution
  answer: string | string[];   // string for choice/binary/matrix/text/date; array for multi
  answered_at: number;
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
  is_returning_user: boolean;
  prior_session_summary?: string;

  choice_draft: Choice | null;
  hypotheses: Hypothesis[];

  queue: QueueItem[];
  picks_log: PickEvent[];
  timing_log: TimingEvent[];
  asked_node_ids: string[];
  active_threads: ActiveThread[];

  heat: number;                  // [0, 1]
  heat_history: number[];        // one entry per recorded pick — drives fatigue close
  phase: Phase;
  closed: boolean;
  close_reason?: CloseReason;
};

// ─── Behavioural events (engine-internal, drive heat) ───

export type BehavioralSignals = {
  latency_ms: number;            // for this pick
  rolling_median_ms: number;     // engine's running median over recent picks
  is_pass: boolean;
  is_dark_question: boolean;
  is_multi_select: boolean;
  multi_select_count?: number;
  revisions: number;
};

// ─── Agent I/O ──────────────────────────────────────────

export type ObserverInput = {
  state: EngineState;
  latest_pick: PickEvent;
  relevant_interp: Record<string, string>;
};

export type ObserverOutput = {
  notes_to_append: Omit<Note, 'created_at'>[];
  cast_updates: CastMember[];
  contradictions_found: Contradiction[];
  hooks_found: Hook[];

  choice_update: Choice | null;
  hypotheses_updates: Hypothesis[];

  engagement_signal: 'high' | 'normal' | 'low';
  phase_advance_signal: boolean;

  thread_status_updates: Array<{ thread_id: string; status: ActiveThread['status'] }>;

  ready_to_close: boolean;
  recommended_posture_update?: string;
};

export type InvestigatorAvailableNode = {
  id: string;
  text: string;
  format: AnswerFormat;
  is_dark: boolean;
  interp_hint?: string;
};

export type InvestigatorInput = {
  state: EngineState;
  available_nodes: InvestigatorAvailableNode[];
};

export type InvestigatorOutput = {
  next_question: {
    node_id: string;              // must be in available_nodes OR 'GENERATED'
    text?: string;                // only if node_id === 'GENERATED'
    options?: string[];           // only if node_id === 'GENERATED'
    fmt?: AnswerFormat;           // only if node_id === 'GENERATED'
    prompted_by: string | null;
  };
  preamble: string;               // may be empty
  queue_additions?: Array<{
    node_id: string;
    prompted_by: string | null;
    priority: 'normal' | 'high' | 'urgent';
  }>;
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
  /** The opinionated PI brief the witch reads (200-400 words). */
  prose_brief: string;
  /** Three openers for the tent. Schema-locked to legacy Question shape. */
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
