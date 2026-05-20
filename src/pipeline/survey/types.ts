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
// `fork` is a 9-row dichotomy picker with three tap zones per row
// (left / bar-stuck-between / right). Options are stored as `left | right`
// strings; the ForkChoice UI splits the pipe and the answer encoding
// uses `"left"` / `"right"` / `"between:left/right"`.
export type AnswerFormat = 'text' | 'date' | 'choice' | 'binary' | 'matrix' | 'intent' | 'relationship_pick' | 'relationship_status' | 'fork';

/** Six tasteful, broadly-inclusive buckets for the relationship-status
 *  opener. Order is load-bearing: "single" first so the answer doesn't
 *  feel ranked; "prefer not to say" last so it's an opt-out, not a flag. */
export type RelationshipStatus =
  | 'single'
  | 'dating'
  | 'in a relationship'
  | 'married'
  | 'it\'s complicated'
  | 'prefer not to say';

export const RELATIONSHIP_STATUS_OPTIONS: RelationshipStatus[] = [
  'single',
  'dating',
  'in a relationship',
  'married',
  "it's complicated",
  'prefer not to say',
];

/** [answer_text] | [answer_text, comment]. Comment is shown inline after pick. */
export type AnswerTuple = [string] | [string, string];

/** Structured decoder hook attached to a TreeNode's probe field.
 *
 *  - `surface`     what the literal answer is about
 *  - `inversions`  what answers may invert to — read by the algorithmic
 *                  seeder to drop hypothesis seeds onto the detective's
 *                  board (e.g. values → fears inversion)
 *  - `watch_for`   cross-history confirms / complicates
 *
 *  All fields optional. Legacy single-line `Probe: text` markdown gets
 *  parsed into `{ surface: text }`. */
export type ProbeBlock = {
  surface?: string;
  inversions?: string;
  watch_for?: string;
};

export type TreeNode = {
  /** Which topic group this node belongs to. Must be one of `tree.topics`. */
  topic: string;
  q: string;
  f: AnswerFormat;
  a?: AnswerTuple[];
  axes?: [[string, string], [string, string]];
  /** Structured decoder hook (see ProbeBlock). Optional. */
  probe?: ProbeBlock;
};

/** Helper: flatten a ProbeBlock to a single string for prompt embedding.
 *  Returns undefined when the probe is empty. Lines are labelled so the
 *  consumer LLM can tell which sub-field a sentence came from. */
export function probeToString(probe?: ProbeBlock): string | undefined {
  if (!probe) return undefined;
  const parts: string[] = [];
  if (probe.surface) parts.push(`surface: ${probe.surface}`);
  if (probe.inversions) parts.push(`inversions: ${probe.inversions}`);
  if (probe.watch_for) parts.push(`watch for: ${probe.watch_for}`);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

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
  /** Set when the user explicitly flags a person as off-limits via the
   *  relationship_pick "who specifically?" follow-up. The detective is
   *  instructed to avoid drafting probes that target this person. */
  off_limits?: boolean;
  /** Pronouns the user picked (or smart-detection inferred from kin
   *  terms like "mom" / "dad"). Independently toggleable. */
  pronouns?: { subjective: 'he' | 'they' | 'she'; objective: 'him' | 'them' | 'her' };
  /** Visual accent color (CSS hex string) for ALL-CAPS rendering of the
   *  person's name in the survey + the reading. Either picked by the
   *  user via the 3 gender-color quick-picks, or randomly assigned and
   *  rerolled via the dice. */
  color?: string;
  /** Observer-derived freeform commentary about this person's role in
   *  the user's psychology (separate from identity / pronouns / color).
   *  Bridges structured identity ("Sam is the brother") with freeform
   *  meaning ("Sam-mentions carry tension"). Only written when there's
   *  new evidence about this person. */
  notes?: string;
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
  confidence: number;            // 0-1 (legacy; ladder rung is the load-bearing signal)
  status: 'inferred' | 'testing' | 'confirmed' | 'refuted';
  /** Turn number when this hypothesis was first seeded onto the board.
   *  Used by the end-of-survey reaper to sort held[] by durability —
   *  older = more diagnostically interesting (survived without
   *  refutation or integration). */
  generated_at?: number;
  /** Increments each turn the hypothesis stays in `tentative` or `held`
   *  without moving up the ladder. Zero for new seeds; bumped by the
   *  engine on each survey tick. */
  age_in_turns?: number;
  /** True iff this hypothesis came from the algorithmic seeder (decoder
   *  inversions) rather than the detective. The observer treats seeded
   *  hypotheses as suggestions to integrate / refute, not as facts. */
  seeded?: boolean;
};

/** The detective's working board: hypotheses sorted into rungs by their
 *  current epistemic status. Replaces the legacy single `hypotheses[]`
 *  array + numeric confidence with a linguistic ladder.
 *
 *  - `confirmed`   direct statement + supporting indirect signal(s)
 *  - `probable`    multiple convergent signals OR one strong one
 *  - `tentative`   single indirect signal · also where algorithmic
 *                  seeds land before observer evaluates them
 *  - `contested`   supporting AND refuting evidence both present —
 *                  theatrical gold; seer hunts here
 *  - `refuted`     direct contradiction or strongly counter-evidenced
 *  - `held`        not integrated AND not refuted; aged in turns;
 *                  surfaced to seer at end as risky probes (older =
 *                  more durable)
 */
export type HypothesisLadder = {
  confirmed: Hypothesis[];
  probable: Hypothesis[];
  tentative: Hypothesis[];
  contested: Hypothesis[];
  refuted: Hypothesis[];
  held: Hypothesis[];
};

/** Empty ladder constant. Used for engine init. */
export const EMPTY_LADDER: HypothesisLadder = {
  confirmed: [],
  probable: [],
  tentative: [],
  contested: [],
  refuted: [],
  held: [],
};

/** A narrative slice across time, anchored to the user's live fork.
 *  Built incrementally by the detective across the survey. Its slots
 *  map directly to card positions in the 4-card diamond:
 *
 *    past_root         → past card (top)
 *    present_pressure  → present card (left/right depending on spread)
 *    fork.A + fork.B   → the two future cards
 *
 *  When no clear fork emerges from the survey, the detective falls
 *  back to "act on this vs. continue as you are" with the avoided
 *  thing as present_pressure. */
export type StoryObject = {
  fork: {
    a: string;
    b: string;
    /** True iff this is the stasis-as-fork fallback (constructed when
     *  no clear fork emerged from the survey answers). */
    is_stasis: boolean;
  } | null;
  /** What in their current life makes the fork acute (the unbearable
   *  thing, in the user's words). */
  present_pressure: string | null;
  /** What in their history pre-figures the fork (the unresolved, the
   *  regret, the pattern). */
  past_root: string | null;
  /** What is at risk on each path. Free-form, two short paragraphs. */
  stakes: { on_a: string; on_b: string } | null;
  /** Verbatim concrete specifics the seer can echo back — names,
   *  places, sensory details, phrases the user used. */
  hooks: string[];
};

/** Empty StoryObject — initial value before the detective has built anything. */
export const EMPTY_STORY: StoryObject = {
  fork: null,
  present_pressure: null,
  past_root: null,
  stakes: null,
  hooks: [],
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

/** Telemetry-derived "side channel" reads — what the user is
 *  transmitting they don't know they're transmitting. The observer
 *  reads these and notes patterns. Each field is a freeform string;
 *  the observer integrates picks-log telemetry into linguistic
 *  observations here. */
export type SideChannel = {
  /** Latency / hesitation / hover-then-tap patterns. */
  signals?: string;
  /** Cross-answer recurring themes / topics. */
  patterns?: string;
  /** Contradictions catalog — Q&A pairs that disagree. */
  contradictions?: string;
  /** Topics the user sidestepped or hesitated on. */
  avoidances?: string;
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
  /** Relationship status captured at the start of the survey as a
   *  derived signal — branches a lot of plausible forks for the seer
   *  (partnership stakes, identity stakes, family/care stakes). null
   *  when the user picks "prefer not to say". */
  relationship_status: RelationshipStatus | null;
  /** The user's question for the cards, captured at the start of the
   *  survey (the "intent" opener). Null when the user pressed "I DON'T
   *  KNOW". At survey close, the IntentConfirm UI uses this to either
   *  confirm-and-edit or ask freshly. The final value lands on
   *  EngineState.chosen_intention. */
  initial_intention: string | null;

  // Populated by the Observer
  /** Legacy structured notes by section. Retained transitionally
   *  during the v2 refactor — the observer in Phase G will start
   *  writing `body` (markdown) instead and this field gets dropped. */
  sections: ProfileSections;
  /** Freeform markdown psychological document the observer rewrites
   *  every turn (Phase G+). Starts as the materials/templates/profile.md
   *  scaffold with HTML-comment instructions; observer integrates
   *  evidence into prose. */
  body: string;
  /** Concrete verbatim specifics the seer can echo back uncannily
   *  (a place, a person's name, a sensory detail, a phrase). */
  hooks: string[];
  /** Growth surface — what the user almost-knows about themselves but
   *  hasn't articulated. Where readings that heal land. */
  edges: string[];
  /** Telemetry-derived reads from channels the user didn't know were
   *  open (latency, hesitation, drift, contradictions, avoidances). */
  side_channel: SideChannel;
  cast: CastMember[];
};

/** The "Clue tools" — everything the Detective is actively reasoning
 *  about. Lives separately from Profile (facts about the user) because
 *  this is INFERENCE, not record. */
export type Investigation = {
  /** Hypothesis board organized into ladder rungs (confirmed / probable /
   *  tentative / contested / refuted / held). Replaces the legacy
   *  single `hypotheses[]` array with numeric confidence. */
  hypotheses: HypothesisLadder;
  /** The narrative cross-section across time, anchored to the user's
   *  fork. Detective builds this incrementally. Replaces the legacy
   *  EngineState.current_understanding (≤3 free-form claims) with a
   *  structured artifact that maps cleanly onto card positions. */
  story: StoryObject;
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
  /** Total number of distinct option taps before final submit. 1 = no
   *  changes; >1 = the user changed their mind mid-question. Side-
   *  channel signal: high counts on Pillars indicate the question landed. */
  interaction_count: number;
  /** First option tapped, even if the user changed before submitting.
   *  Null when the user submitted on first tap (initial_pick === final_pick)
   *  OR when format doesn't lend itself (text/date/intent). */
  initial_pick: string | null;
  /** Final committed answer — what gets stored in PickEvent.answer too.
   *  Mirrored here so the timing log is self-contained for analysis. */
  final_pick: string | string[];
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
  // current_understanding REMOVED (v2 refactor). Replaced by
  // Investigation.story (a structured narrative artifact). The
  // detective in Phase H emits StoryObject instead of free-form claims;
  // engine ignores any current_understanding the legacy prompt still
  // tries to emit until Phase H ships.

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
  // recent_picks REMOVED with Phase G — observer fires every turn now
  // and reads `history` directly. Multi-turn windowing was the legacy
  // strategy for catching up across sparse observer firings.
  /** Detective-only: the running scratchpad from previous turns'
   *  `private_thoughts`. Most-recent last. */
  detective_log?: string[];
  // current_understanding REMOVED — see EngineState comment above.
};

/** Ladder rung name. Used by observer's hypothesis_ladder_moves. */
export type LadderRung = 'confirmed' | 'probable' | 'tentative' | 'contested' | 'refuted' | 'held';

/** Observer outputs the full psychological document rewrite +
 *  side-channel reads + ladder moves. Fires every turn (Phase G+).
 *  Replaces the legacy notes_to_append + cast_updates shape. */
export type ObserverOutput = {
  /** FULL rewrite of profile.body — markdown with the 9 section
   *  headers populated where evidence supports filing, otherwise
   *  leaving the instruction comment intact. */
  profile_body: string;
  /** Verbatim concrete specifics the seer can echo back. Append-style:
   *  observer emits the FULL list each turn; engine replaces. */
  hooks: string[];
  /** Growth surface — what the user almost-knows. Append-style replace. */
  edges: string[];
  /** Telemetry-derived reads. Each field freeform paragraph; engine replaces. */
  side_channel: SideChannel;
  /** Per-CastMember notes updates. Each { label, notes } REPLACES the
   *  matching CastMember's notes. Only emit for people with new
   *  evidence this turn. */
  cast_notes_updates: Array<{
    label: string;
    notes: string;
  }>;
  /** Hypothesis ladder transitions. Engine routes each id from its
   *  current rung to the new rung. Emit only moves (no need to
   *  re-list items that stayed put). */
  hypothesis_ladder_moves: Array<{
    id: string;
    to: LadderRung;
  }>;
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
