// Antechamber engine types. Internal to the antechamber module. On close, the
// engine hands off a pre-built Seer instance (see getSeer()) — no
// compiler stage, no CompilerOutput intermediate.
//
// v2 (Phase 2 — type rip):
// - Investigation / HypothesisLadder / Hypothesis (9-field) / Note /
//   ProfileSections / Hook / Contradiction / Choice / ActiveThread
//   types are GONE. The data model is now LivingDoc (in living-doc.ts)
//   which the observer single-writes and the dowser + coverage
//   read.
// - AntechamberProfile is slimmed — no more body / hooks / edges /
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
// - EngineState.dowser_log dropped (scratchpad lives per-call now).

import type { LivingDoc } from './living-doc';
import type { GuessResult, Instrument } from './instruments';

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
export type AnswerFormat =
  | 'text'
  | 'date'
  | 'choice'
  | 'binary'
  | 'matrix'
  | 'intent'
  | 'relationship_pick'
  | 'relationship_status'
  | 'fork'
  /** v3 dowser-emitted instrument formats. carry an `instrument`
   *  payload on the QueueItem rather than authored options. */
  | 'guess';

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
   *  dowser is guaranteed to see. */
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
  /** v3: when the QueueItem carries an instrument payload (guess,
   *  etc.), it propagates here for the UI component. `text` carries
   *  the on-screen statement; `instrument` carries the structured
   *  metadata (mascot stall lines, correction inversions). */
  instrument?: Instrument;
};

// ─── Antechamber profile (slimmed — identity + cast only in v2) ───

export type CastMember = {
  label: string;
  likely_role?: string;
  supporting_picks: string[];
  confidence: 'low' | 'medium' | 'high';
  /** Set when the user explicitly flags a person as off-limits via the
   *  relationship_pick "who specifically?" follow-up. The dowser is
   *  instructed to avoid drafting probes that target this person. */
  off_limits?: boolean;
  /** Pronouns the user picked (or smart-detection inferred from kin
   *  terms like "mom" / "dad"). Independently toggleable. */
  pronouns?: { subjective: 'he' | 'they' | 'she'; objective: 'him' | 'them' | 'her' };
  /** Visual accent color (CSS hex string) for ALL-CAPS rendering of the
   *  person's name in the antechamber + the reading. Either picked by the
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

export type AntechamberProfile = {
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
  /** Relationship status captured at the start of the antechamber. */
  relationship_status: RelationshipStatus | null;
  /** The user's question for the cards, captured at the start of the
   *  survey (the "intent" opener). Null when the user pressed "I DON'T
   *  KNOW". At antechamber close, the IntentConfirm UI uses this to either
   *  confirm-and-edit or ask freshly. */
  initial_intention: string | null;
  /** Cast members the user named via relationship_pick. The actual
   *  psychological commentary about them lives in `doc.scaffold.cast_notes`. */
  cast: CastMember[];
};

// ─── StoryObject (preserved — load-bearing for Augur + Seer) ──

/** A narrative slice across time, anchored to the user's live fork.
 *  Built incrementally by the dowser across the antechamber. Its slots
 *  map directly to card positions in the 4-card diamond:
 *
 *    past_root         → past card (top)
 *    present_pressure  → present card (left/right depending on spread)
 *    fork.A + fork.B   → the two future cards
 *
 *  When no clear fork emerges from the antechamber, the dowser falls
 *  back to "act on this vs. continue as you are" with the avoided
 *  thing as present_pressure. */
export type StoryObject = {
  fork: {
    a: string;
    b: string;
    /** True iff this is the stasis-as-fork fallback (constructed when
     *  no clear fork emerged from the antechamber answers). */
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

/** Empty StoryObject — initial value before the dowser has built anything. */
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

// (ObserverOutput, DowserOutput, LadderRung deleted in Phase 3 —
// the v2 schemas live in agents/observer/schema.ts and
// agents/dowser/schema.ts; types inferred via z.infer.)

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
   *  user-typed or human-authored in materials/pillars.md. The hooks
   *  pipeline filters engine-authored picks so the Seer never echoes
   *  back planted option text as the user's verbatim phrase. Defaults
   *  to false/undefined for human-authored questions. */
  is_engine_authored?: boolean;
  /** v3 structured outcome for instrument-shaped picks (currently only
   *  guess). Lets the debug panel + future telemetry rig compute
   *  the confirm/reject/correct rate without re-parsing the answer
   *  string. Undefined for non-instrument picks. */
  instrument_result?: GuessResult;
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
   *  Phase 4 dowser/crowd/interrogator pipeline rather than authored
   *  in materials/pillars.md. PickEvent.is_engine_authored is propagated
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
  /** v3 dowser-emitted instrument payload. When set, the queue
   *  item's UI render uses the instrument-specific component
   *  (GuessChoice for kind='guess', etc.) and `inline.text`
   *  carries the on-screen statement. PickEvent.instrument_result
   *  records the structured outcome at answer time. */
  instrument?: Instrument;
};

// ─── Engine state ───────────────────────────────────────

export type CloseReason = 'user_exit' | 'queue_exhausted' | 'cap' | 'dead_end_signals';

/** Post-question-cap lifecycle:
 *
 *   questions          → user is still answering survey questions
 *   finalizing         → queue empty; final synthesis running
 *   awaiting_intention → finalize complete; user is typing/confirming
 *                        their question (the IntentConfirm UI)
 *   compiling          → user submitted intention; augur + seer constructing
 *   reading_ready      → ready to enter the reading
 *   null_landing       → content-level dead-end signals fired; the engine
 *                        is landing the user gracefully without manufacturing
 *                        a Dilemma. bypasses augur; routes to a light-reading
 *                        mode the seer doesn't implement yet (Phase 2 just
 *                        wires the transition cleanly). */
export type AntechamberStage =
  | 'questions'
  | 'finalizing'
  | 'awaiting_intention'
  | 'compiling'
  | 'reading_ready'
  | 'null_landing';

// ─── Verbatim log (immutable user-text store) ─────────────

/** Captures every free-text user input — the exact phrasing the user
 *  typed. Append-only and never rewritten by any agent. The profiler's
 *  prose anchor REFERENCES into this log ("said 'preserves rest' — see
 *  entry 7") rather than reproducing quotes, because LLM paraphrase
 *  would corrupt the fidelity. This is the sibling artifact the seer
 *  pulls exact strings from when it wants an uncanny callback. */
export type VerbatimEntry = {
  /** 0-based index; preserved across the session. */
  index: number;
  /** 1-based turn the entry was captured on. 0 = opener (pre-pillar). */
  turn: number;
  /** Where the text came from — drives both the profiler's framing and
   *  later analysis. */
  source: 'name' | 'intent' | 'correction' | 'text_fallback' | 'relationship_label';
  /** Verbatim text. Trimmed of leading/trailing whitespace but otherwise
   *  preserved (case, punctuation, typos). */
  text: string;
  /** Wall-clock timestamp the entry was captured. */
  captured_at: number;
};

export type EngineState = {
  session_id: string;
  started_at: number;
  tree_version: string;

  profile: AntechamberProfile;
  /** v2: the LivingDoc replaces the legacy Investigation. Observer
   *  is the sole writer; dowser + coverage read. Story + held
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

  // dowser_log REMOVED in v2. The dowser's scratchpad lives
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

  /** Where we are in the post-cap end-of-antechamber flow. */
  stage: AntechamberStage;
  /** Shaman's 4 candidate intention questions. Populated when shaman returns. */
  intentions_offered: string[];
  /** What the user picked (or wrote in). Populated by submitIntention(). */
  chosen_intention: string | null;

  /** v3: the markdown Subject Anchor — the prose profile the profiler
   *  rewrites whole-doc on every trigger (every 3 turns + corrections +
   *  close). Empty string before the first profiler pass. This is the
   *  artifact handed downstream to the seer (alongside the verbatim
   *  log). LivingDoc remains as the intermediate working state during
   *  the Phase 2 transition; the anchor is the new contract. */
  anchor: string;
  /** v3: append-only immutable store of user free-text inputs. See
   *  VerbatimEntry. The anchor references entries by index rather than
   *  reproducing the text. */
  verbatim_log: VerbatimEntry[];

  /** Interrogation pivot: the unified narrative the dowser reads.
   *  Built incrementally — pillar picks + seeder observations during
   *  the pillar phase; guesses + responses during Interrogation. */
  transcript: import('./transcript').TranscriptEntry[];
  /** The dowser's accumulated thinking transcript across calls.
   *  Appended every dowser output (the free-form section before
   *  ===HYPOTHESIS===). Surfaces back into the next dowser payload
   *  so reasoning stays continuous. */
  dowser_thinking: string;
  /** Legacy trajectory log of dowser hypotheses — populated for
   *  downstream agents (WEAVER, Compiler) that still read it as a
   *  flat list. The post-rewrite source of truth for "which
   *  hypothesis went with which guess" is the hypothesis field on
   *  TranscriptEntry of kind 'guess'; this array shadows it for
   *  consumers that haven't been refactored yet. */
  hypotheses: string[];
  /** HOTs the user has recognised — the hypothesis active when each
   *  HOT landed, banked here. Append-only. Sounding exits when this
   *  reaches three, OR engagement wind_down, OR the 20-guess ceiling. */
  candidate_shapes: string[];
  /** Queued guesses the dowser has emitted but the user hasn't
   *  answered yet. Length capped at LOOKAHEAD_CAP (3). Provisional —
   *  latest user answer can invalidate and trigger re-generation. */
  guess_queue: QueuedGuess[];

  /** WEAVER's curated candidate set. Replaced wholesale on each WEAVER
   *  call (re-listing-as-vote is implicit via re-appearance). Read at
   *  close by the intention-suggestor (one suggestion per candidate)
   *  and the compiler (sieve). Empty during pillars. */
  weaver_candidates: PotentialDilemma[];
  /** WEAVER's engagement read. Three-state, ratchet-only-down:
   *    'live'      — refill the queue normally
   *    'wind_down' — stop refilling; let the current queue (up to 3
   *                  pre-rolled guesses) drain gracefully, then
   *                  transition to close. Borderline-engaged user
   *                  gets a soft off-ramp.
   *    'flat'      — drop the queue NOW. User answers the question
   *                  currently on screen, then close. Reserved for
   *                  clear disengagement.
   *  Mr Brainstorm's middle-rung addition — the prior boolean was
   *  one-sided (no graceful exit). Sticky downgrades only: state can
   *  ratchet live → wind_down → flat but never back up. */
  weaver_engagement: 'live' | 'wind_down' | 'flat';
  /** How many WEAVER calls have completed. Surfaced into the prompt as
   *  RUN_IDX so WEAVER can calibrate explore→consolidate over its
   *  expected runs (typically 3 across a 6-guess interrogation). */
  weaver_run_count: number;

  /** Compiler-as-sieve output. Populated when the compiler runs (after
   *  the user submits their intention). The structured Dilemma the
   *  seer reads. state.anchor is the rendered-to-markdown form for
   *  persistence + legacy profile assembly. Null until the compiler
   *  has fired. */
  dilemma: import('./agents/compiler/schema').DilemmaDocument | null;

  /** One-sentence intention suggestions fired off in parallel — one
   *  per WEAVER candidate — at the intent-confirmation screen. Each
   *  resolves independently and pushes into this array, so the UI
   *  can render chips as they arrive. Empty for returning users in
   *  lite mode (no WEAVER ran) and during pillars / interrogation. */
  intention_suggestions: string[];
  /** True while one or more intention-suggestion helpers are in
   *  flight. UI uses this to render a "thinking" affordance below
   *  the intent input. Resets to false when all parallel calls
   *  resolve (or all error). */
  intention_suggestions_loading: boolean;
};

/** WEAVER's working unit. Maintained as a small set across Interrogation
 *  calls. The compiler-as-sieve reads `state.weaver_candidates` at close
 *  to pick or build the final Dilemma. Re-listing across calls is the
 *  organic vote-by-repetition signal — the engine doesn't store a vote
 *  counter; presence in the latest set IS the vote.
 *
 *  Trajectory fields (created_at_turn, last_extension_turn,
 *  extension_count) are engine-maintained — WEAVER never writes them.
 *  Engine diffs the new set against the prior set on each WEAVER pass
 *  and updates these so downstream (the compiler) can see "this
 *  candidate has been stable across 3 weavings with growing evidence"
 *  vs. "this just appeared." Pure observability — no behavior change.
 *  Optional for back-compat with snapshots taken before trajectory
 *  shipped. */
export type PotentialDilemma = {
  /** Kebab-case slug. Stable across calls — WEAVER is instructed to
   *  reuse the exact prior label when keeping a candidate live. */
  label: string;
  /** One-sentence description of the situation + implied fork. */
  description: string;
  /** Evidence-anchored thought notes accumulated across calls. Each
   *  thought cites at least one `entry N` / `guess N WARM|COLD`. */
  thoughts: string[];
  /** Engine-maintained: the WEAVER run on which this candidate first
   *  appeared in the set. */
  created_at_turn?: number;
  /** Engine-maintained: the most recent WEAVER run on which this
   *  candidate's thoughts grew. Initially equals created_at_turn. */
  last_extension_turn?: number;
  /** Engine-maintained: number of WEAVER runs on which this candidate
   *  gained new thoughts (i.e. evidence accumulated). Lets the
   *  compiler weight stable-with-growing-evidence candidates above
   *  drive-by appearances. */
  extension_count?: number;
};

/** A dowser-emitted guess queued for the user. The dowser
 *  may have generated this several calls ahead; each real answer
 *  prompts the engine to reconcile the queue against the latest
 *  evidence. */
export type QueuedGuess = {
  /** 1-based index across the Sounding (Interrogation) phase. */
  idx: number;
  statement: string;
  /** The dowser's current hypothesis when this guess was emitted —
   *  the candidate dilemma it was testing, in the user's voice as a
   *  question. Banked into state.candidate_shapes on HOT. */
  hypothesis: string;
  /** Mascot stall lines — empty in the post-rewrite dowser. Kept as
   *  optional for snapshot back-compat; UI treats empty as "no line". */
  comment_if_warm?: string;
  comment_if_cold?: string;
  comment_if_hot?: string;
  /** When the dowser emitted this guess (post-opener turn count). */
  emitted_at_turn: number;
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
  /** Options actually shown to the user (post-dowser-edit). */
  options_shown: string[];
  /** The user's pick. */
  answer: string | string[];
  /** Profile so far (slim — identity + cast). */
  profile: AntechamberProfile;
  /** LivingDoc snapshot at pipeline start. */
  doc: LivingDoc;
  /** Full Q&A history, including this turn. */
  history: PickEvent[];
  /** Questions currently queued AFTER this one (head=next to ask). */
  queue: QueueItem[];
};

// ─── Engine API ─────────────────────────────────────────

export type EngineListener = (state: EngineState) => void;
