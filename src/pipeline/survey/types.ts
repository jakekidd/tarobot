// Survey engine types. Internal to the survey module. On close, the
// engine hands off a pre-built Seer instance (see getSeer()) — no
// compiler stage, no CompilerOutput intermediate.

// ─── Phase ──────────────────────────────────────────────

export type Phase = 'A' | 'B' | 'C' | 'D' | 'E';
export const PHASE_ORDER: Phase[] = ['A', 'B', 'C', 'D', 'E'];

// ─── Dialogue tree ──────────────────────────────────────

// Question formats. `multi` was dropped — collapsed to `choice` (single
// select). `binary` ALWAYS resolves to [yes, no, sometimes] regardless
// of the node's `a` field; investigator can't alter binary options.
export type AnswerFormat = 'text' | 'date' | 'choice' | 'binary' | 'matrix' | 'intent' | 'relationship_pick';

/** [answer_text] | [answer_text, comment]. Comment is shown inline after pick. */
export type AnswerTuple = [string] | [string, string];

export type TreeNode = {
  /** Which topic group this node belongs to. Must be one of `tree.topics`. */
  topic: string;
  q: string;
  f: AnswerFormat;
  a?: AnswerTuple[];
  axes?: [[string, string], [string, string]];
  /** Decoder hook: a short note to the detective explaining what this
   *  question is REALLY probing for. Separate from per-answer `interp`
   *  (which is post-hoc interpretation). The probe primes the detective
   *  before the answer arrives — author intent loaded into the prompt. */
  probe?: string;
};

export type DialogueTree = {
  v: string;
  /** Ordered list of topic ids the editor groups nodes by. */
  topics: string[];
  /** Openers (in order) — always run first; deterministic identity gathers
   *  (name, birthday, intent). Pipeline does NOT fire on opener answers. */
  openers: string[];
  /** Pillar questions (in order). Always asked, in this order, immediately
   *  after the openers. Pipeline DOES fire on Pillar answers. These are
   *  the structural backbone of every survey — broad-coverage probes the
   *  detective is guaranteed to see. */
  pillars: string[];
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
  /** The user's question for the cards, captured at the start of the
   *  survey (the "intent" opener). Null when the user pressed "I DON'T
   *  KNOW". At survey close, the IntentConfirm UI uses this to either
   *  confirm-and-edit or ask freshly. The final value lands on
   *  EngineState.chosen_intention. */
  initial_intention: string | null;

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

/** Post-question-cap lifecycle:
 *
 *   questions          → user is still answering survey questions
 *   awaiting_intention → cap hit; user is typing/confirming their question
 *                        for the cards (the IntentConfirm UI)
 *   compiling          → user submitted intention; augur + seer constructing
 *   reading_ready      → ready to enter the reading
 */
export type SurveyStage =
  | 'questions'
  | 'awaiting_intention'
  | 'compiling'
  | 'reading_ready';

export type EngineState = {
  session_id: string;
  started_at: number;
  tree_version: string;

  profile: SurveyProfile;
  investigation: Investigation;     // the Clue tools live here
  is_returning_user: boolean;
  /** When the visitor is a returning Person, these carry over from
   *  their durable record so the engine can dedupe (answered_node_ids
   *  filtered from starter pool + interrogator basket) and the shaman
   *  can avoid suggesting an intention they've already pursued. Both
   *  empty for first-time users. The Person id itself is owned by
   *  Survey.tsx — engine doesn't need it for any internal logic. */
  prior_answered_node_ids: string[];
  prior_intentions: string[];
  prior_session_summary?: string;

  /** Detective's running scratchpad — last N `private_thoughts` entries
   *  fed back to the detective on its next call. Capped at DETECTIVE_LOG_CAP. */
  detective_log: string[];
  /** Detective's compressed synthesis: ≤3 load-bearing claims about the
   *  user. Updated on EVERY detective call (replaces prior). Read by
   *  the next detective call AND passed to the seer's directorIntro as
   *  the spine of the prose_brief. */
  current_understanding: string[];

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

  /** Where we are in the post-cap end-of-survey flow. */
  stage: SurveyStage;
  /** Shaman's 4 candidate intention questions. Populated when shaman returns. */
  intentions_offered: string[];
  /** What the user picked (or wrote in). Populated by submitIntention(). */
  chosen_intention: string | null;
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

// BasketItem removed — the detective no longer picks questions. The
// queue is pre-rolled and the detective edits queued items in place.

export type PipelineContext = {
  /** 1-based turn number — counts post-opener picks only. */
  index: number;
  /** Text of the just-answered question (post-substitution). */
  question: string;
  /** Options actually shown to the user (post-detective-edit). */
  options_shown: string[];
  /** The user's pick. */
  answer: string | string[];
  /** Profile so far — agents read this snapshot at pipeline start.
   *  Same-pipeline observer updates DO NOT propagate (parallel firing). */
  profile: SurveyProfile;
  /** Investigation so far — same snapshot semantics as profile. */
  investigation: Investigation;
  /** Full Q&A history, including this turn. */
  history: PickEvent[];
  /** Questions currently queued AFTER this one (head=next to ask). */
  queue: QueueItem[];
  /** Observer-only: when present, replaces `history`-tail-focus with a
   *  multi-turn window. Set by the engine on observer fire turns
   *  (every OBSERVER_INTERVAL post-opener picks). */
  recent_picks?: PickEvent[];
  /** Detective-only: the running scratchpad from previous turns'
   *  `private_thoughts`. Most-recent last. */
  detective_log?: string[];
  /** Detective-only: the current compressed synthesis (≤3 claims) the
   *  detective is maintaining. Detective sees the prior value and may
   *  keep / edit / rewrite it on each call. */
  current_understanding?: string[];
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
  /** Private scratchpad the detective writes out. Half-or-more of the
   *  model's response. Appended to engine state's detective_log and
   *  surfaced on subsequent detective calls as continuity. */
  private_thoughts: string;
  /** Compressed synthesis: ≤3 short claims (each ≤25 words) capturing
   *  the load-bearing facts about this person. REPLACES prior on each
   *  call. Surfaced to seer.directorIntro as the spine of the brief. */
  current_understanding: string[];
  /** Edits to upcoming queue items. Each edit references a queue index
   *  (0 = the very next question). The detective doesn't pick questions
   *  any more — it personalizes them. Edits are clipped to the sliding
   *  window the detective is shown (typically next 5). */
  queue_edits: Array<{
    index: number;
    preamble?: string;
    options_override?: string[];
  }>;
  /** Private to engine logs — 2-3 sentences on what's now believed. */
  reasoning: string;
};

/** Interrogator's only job: pick the next question + optional flavor. */
export type InterrogatorOutput = {
  next_question: {
    /** MUST be an id from basket[]. */
    node_id: string;
    /** Optional the cat-voice prefix (rendered above the question text).
     *  Does NOT modify the question text itself. Empty = no preamble. */
    preamble?: string;
    /** Choice-format only. Replaces the default options (can shrink,
     *  reorder, ADD, or substitute). Ignored for binary/matrix/text/date. */
    options_override?: string[];
  };
  /** Private to engine logs — 1-2 sentences on why this pick. */
  reasoning: string;
};

// Shaman types removed — the user provides their own intention via the
// IntentConfirm UI; no LLM guess. See engine.beginIntentionStage().

// Compiler types removed — survey hands off via a pre-built Seer
// (see ../seer/seer.ts). The intro pipeline (cognition → persona) is
// kicked off in the Seer's constructor; there's no separate compiler
// stage.

// ─── Engine API ─────────────────────────────────────────

export type EngineListener = (state: EngineState) => void;
