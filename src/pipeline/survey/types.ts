// Survey engine types. Internal to the survey module. On close, the
// engine hands off a pre-built Seer instance (see getSeer()) — no
// compiler stage, no CompilerOutput intermediate.
//
// v2 (Phase 2 — type rip):
// - Investigation / HypothesisLadder / Hypothesis (9-field) / Note /
//   ProfileSections / Hook / Contradiction / Choice / ActiveThread
//   types are GONE. The data model is now LivingDoc (in living-doc.ts)
//   which the observer single-writes and the detective + coverage
//   read.
// - SurveyProfile is slimmed — no more body / hooks / edges /
//   side_channel / sections. Identity + cast only. The doc owns the
//   psychological content.
// - PickEvent + QueueItem now carry `is_engine_authored` (Phase 3+
//   feature flag; defaults to false / undefined since today's
//   pool/pillars are all human-authored). The hooks pipeline filters
//   on this to prevent engine-authored option text from being echoed
//   back by the Seer as the user's verbatim phrase ("instagram"
//   guard).
// - TimingEvent gains `latency_z` for the per-user latency z-score
//   (computed by algoExtract; treated as a first-class telemetry
//   channel since latency is the only "body language" tell available).
// - EngineState.investigation → EngineState.doc (LivingDoc).
// - EngineState.detective_log dropped (scratchpad lives per-call now).

import type { LivingDoc } from './living-doc';

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
 *                  seeder to drop probe seeds onto doc.held
 *                  (e.g. values → fears inversion)
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

// ─── Survey profile (slimmed — identity + cast only in v2) ───

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
   *  the user's psychology. In v2 this is duplicated into
   *  doc.scaffold.cast_notes[label] for the observer's working view;
   *  the source of truth for the seer is the cast_notes there.
   *  Kept on CastMember for back-compat with returning-user storage. */
  notes?: string;
};

export type SurveyProfile = {
  // Populated deterministically from openers (computed in seeder /
  // engine.applyOpenerDataIfRelevant). The LLM does not produce
  // these — they are derived from birthday by pure function.
  name: string;
  birthday: { year: number; month: number; day: number } | null;
  sun_sign: string | null;
  life_path: number | null;
  birth_card: { number: number; name: string } | null;
  age_bracket: string | null;
  birth_time_bracket: 'morning' | 'afternoon_evening' | 'overnight' | 'unknown' | null;
  /** Relationship status captured at the start of the survey. */
  relationship_status: RelationshipStatus | null;
  /** The user's question for the cards, captured at the start of the
   *  survey (the "intent" opener). Null when the user pressed "I DON'T
   *  KNOW". At survey close, the IntentConfirm UI uses this to either
   *  confirm-and-edit or ask freshly. */
  initial_intention: string | null;
  /** Cast members the user named via relationship_pick. The actual
   *  psychological commentary about them lives in `doc.scaffold.cast_notes`. */
  cast: CastMember[];
};

// ─── StoryObject (preserved — load-bearing for Augur + Seer) ──

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

// ─── Compatibility seams ─────────────────────────────────

/** Telemetry-derived "side channel" reads. Kept so the frozen Profile
 *  shape's `observer_side_channel?: SideChannel` still typechecks.
 *  In v2 the engine fills it from doc.scaffold.tells + algoExtract
 *  latency-z at the assembly seam — not from a legacy ObserverOutput. */
export type SideChannel = {
  signals?: string;
  patterns?: string;
  contradictions?: string;
  avoidances?: string;
};

/** Seer-seam compatibility shim. The Seer (untouched in v2) consumes
 *  `Hypothesis[]` with a `.description` field; the v2 survey produces
 *  `Probe[]` with `.claim`. The engine maps Probe → Hypothesis at
 *  the seer-construction boundary. */
export type Hypothesis = {
  id: string;
  description: string;     // = Probe.claim
  age_in_turns?: number;
  // Legacy fields tolerated by the seer's director payload but unused
  // in v2 — kept for type compatibility:
  supporting_picks?: string[];
  contradicting_picks?: string[];
  confidence?: number;
  status?: string;
  seeded?: boolean;
  generated_at?: number;
};

// (ObserverOutput, DetectiveOutput, LadderRung deleted in Phase 3 —
// the v2 schemas live in agents/observer/schema.ts and
// agents/detective/schema.ts; types inferred via z.infer.)

// ─── Events ─────────────────────────────────────────────

export type PickEvent = {
  node_id: string;
  question_text: string;       // post-substitution
  options_shown: string[];     // full set shown to user (includes engine-authored overrides)
  answer: string | string[];   // string for choice/binary/matrix/text/date
  answered_at: number;
  latency_ms: number;
  prompted_by: string | null;  // thread_id or parent node_id if injected
  /** v2 flag: true when this pick's question stem and/or chosen option
   *  was engine-authored (Phase 4 generation pipeline) rather than
   *  user-typed or human-authored in materials/survey.md. The hooks
   *  pipeline filters engine-authored picks so the Seer never echoes
   *  back planted option text as the user's verbatim phrase. Defaults
   *  to false/undefined for human-authored questions. */
  is_engine_authored?: boolean;
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
  /** v2: per-user latency z-score. Computed by algoExtract as the
   *  running mean+stddev over post-opener picks; |z|>1.5 = outlier
   *  (a flinch — pain or deliberation). First-class telemetry channel,
   *  not just side-channel. */
  latency_z?: number;
};

// ─── Queue ──────────────────────────────────────────────

export type QueueItem = {
  node_id: string;
  prompted_by: string | null;
  priority: 'normal' | 'high' | 'urgent';
  preamble?: string;
  /** Investigator-supplied override for the `choice`-format options on
   *  this question. Ignored for any other format. */
  options_override?: string[];
  /** v2 flag: true when the question + options were generated by the
   *  Phase 4 detective/crowd/interrogator pipeline rather than authored
   *  in materials/survey.md. PickEvent.is_engine_authored is propagated
   *  from this flag at answer time. */
  is_engine_authored?: boolean;
  /** Phase 4 inline question payload — set on engine-authored items
   *  that have no corresponding TREE.nodes entry. Renderers use this
   *  in place of `renderQuestion(node_id, ...)` when present. axis_tag
   *  is the interrogator's dimension label, surfaced to the coverage
   *  map at picks-log inspect time. */
  inline?: {
    text: string;
    format: AnswerFormat;
    options: string[];
    axis_tag?: string;
  };
};

// ─── Engine state ───────────────────────────────────────

export type CloseReason = 'user_exit' | 'queue_exhausted' | 'cap';

/** Post-question-cap lifecycle:
 *
 *   questions          → user is still answering survey questions
 *   finalizing         → queue empty; final synthesis running
 *   awaiting_intention → finalize complete; user is typing/confirming
 *                        their question (the IntentConfirm UI)
 *   compiling          → user submitted intention; augur + seer constructing
 *   reading_ready      → ready to enter the reading
 */
export type SurveyStage =
  | 'questions'
  | 'finalizing'
  | 'awaiting_intention'
  | 'compiling'
  | 'reading_ready';

export type EngineState = {
  session_id: string;
  started_at: number;
  tree_version: string;

  profile: SurveyProfile;
  /** v2: the LivingDoc replaces the legacy Investigation. Observer
   *  is the sole writer; detective + coverage read. Story + held
   *  probes survive Investigation's deletion and live here. */
  doc: LivingDoc;
  is_returning_user: boolean;
  /** When the visitor is a returning Person, these carry over from
   *  their durable record so the engine can dedupe (answered_node_ids
   *  filtered from starter pool) and the shaman can avoid suggesting
   *  an intention they've already pursued. Both empty for first-time
   *  users. */
  prior_answered_node_ids: string[];
  prior_intentions: string[];
  prior_session_summary?: string;

  // detective_log REMOVED in v2. The detective's scratchpad lives
  // per-call (passed through ctx) and isn't persisted across turns
  // as a separate engine field. The doc.margin captures cross-turn
  // texture; the leading_hypothesis captures cross-turn commitment.

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

/** Phase 2 legacy PipelineContext shape. Per-agent payload builders
 *  consume this; Phase 3 redefines around LivingDoc directly. For
 *  Phase 2 we adapt at the call site: build a shim PipelineContext
 *  with empty investigation when needed by the stubbed agents (which
 *  throw before reading it). */
export type PipelineContext = {
  /** 1-based turn number — counts post-opener picks only. */
  index: number;
  /** Text of the just-answered question (post-substitution). */
  question: string;
  /** Options actually shown to the user (post-detective-edit). */
  options_shown: string[];
  /** The user's pick. */
  answer: string | string[];
  /** Profile so far (slim — identity + cast). */
  profile: SurveyProfile;
  /** LivingDoc snapshot at pipeline start. */
  doc: LivingDoc;
  /** Full Q&A history, including this turn. */
  history: PickEvent[];
  /** Questions currently queued AFTER this one (head=next to ask). */
  queue: QueueItem[];
};

// ─── Engine API ─────────────────────────────────────────

export type EngineListener = (state: EngineState) => void;
