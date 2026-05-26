// Survey engine. Plain TS class — no React, no DOM, no model SDK. Owns
// EngineState; everything else (UI, tests, scripts) reads state and submits
// answers. Agents fire through an LLMAdapter handed in at construction.
//
// Concurrency model: every non-opener pick spawns a 3-agent SERIAL pipeline
// in the background: Observer → Detective → Interrogator. Each agent gets
// the latest mutated PipelineContext from the previous one. The pipeline
// never blocks the user's main path — the queue is pre-seeded with 6
// random starters so the user never waits for the next question unless
// they sprint past the pipeline's wall-time (~3.5s).
//
// See docs/SURVEY_PIPELINE.md for design rationale.

import type { LLMAdapter } from '../llm/adapter';
import { runSeeder } from './agents/seeder';
import { runDetective, blobToQueuedAssertion } from './agents/detective';
import { runPsych } from './agents/psych';
import { runCompiler, renderDilemmaAsAnchor, type DilemmaDocument } from './agents/compiler';
import { diffAnchors } from './anchor';
import { checkDeadEndSignals } from './signals';
import { computeLatencyZScores } from './algoExtract';
import { pickToTranscriptEntry, type TranscriptEntry } from './transcript';
import { runAugur } from './agents/augur';
import { Seer } from '../seer';
import { drawForSpread } from '../cards';
import { FOUR_CARD_DIAMOND } from '../spreads';
import { assembleProfile } from './profile-assembly';
import { computeAstroProfile, parseBirthDate } from '../astrology';
import { publishDebug } from '../../debug/debugBus';
import { publishAnchor } from '../../debug/anchorBus';
import { publishCompilerStream } from '../../debug/compilerStreamBus';
import {
  getNode,
  getOpeners,
  getPillars,
  getPoolNodeIds,
  renderQueueItem,
  TREE,
} from './tree';
import { derivePhase } from './phase';
import { ageHeldProbes, generateSeeds } from './seeder';
import { appendVerbatim } from './verbatim-log';
import { parseAssertionAnswer } from './instruments';
import type {
  EngineListener,
  EngineState,
  PickEvent,
  QueueItem,
  RenderedQuestion,
  SurveyProfile,
  TimingEvent,
  VerbatimEntry,
} from './types';
import type { LivingDoc } from './living-doc';
import { EMPTY_DOC } from './living-doc';

export type EngineOpts = {
  adapter: LLMAdapter;
  session_id?: string;
  /** Pre-seeded returning-user data. When supplied at construction the
   *  engine starts in returning-mode: openers satisfied by profile_seed
   *  are skipped, and answered_node_ids dedupe-filter the starter pool
   *  and the interrogator basket. The shaman receives prior_intentions
   *  as context so it can avoid duplicates. Person id is tracked by
   *  the UI layer — the engine doesn't need it. */
  returning?: {
    profile_seed: Partial<SurveyProfile>;
    answered_node_ids: string[];
    prior_intentions: string[];
    prior_session_summary?: string;
  };
  /** Optional engine state to hydrate from — used by the headless
   *  driver script (scripts/survey-driver.ts) to restore mid-session
   *  state across CLI invocations. When provided, replaces the
   *  fresh initState. The runtime-only fields (in-flight counters,
   *  pickEpoch, seer) are NOT serialized; they start fresh per
   *  invocation and that's fine for the per-turn driver model. */
  initialState?: EngineState;
};

const OPENER_NODE_IDS = new Set<string>(getOpeners());

/** Returning-user lite mode draws exactly this many random pool questions
 *  (dedup'd against prior history). No Pillars on returning visits. */
export const RETURNING_LITE_COUNT = 6;
/** v3: how many detective-emitted assertions can land before the
 *  engine forces beginIntentionStage. Keeps the session bounded if
 *  the detective never emits 'conclude' on its own. */
const POST_PILLAR_ASSERTION_CAP = 8;
/** Back-compat alias for callsites that still reference the old name. */
export const STARTER_SEED_COUNT = RETURNING_LITE_COUNT;

// Observer interval / window constants removed — Phase G+ observer
// fires EVERY post-opener pick. The legacy multi-turn window framing
// (catch up across the gap) is replaced by every-turn rewriting of
// the living document.
//
// (DETECTIVE_LOG_CAP removed — v2 detective doesn't persist a
// cross-turn scratchpad in engine state. The leading_hypothesis +
// doc.margin carry continuity in Phase 3.)

export class SurveyEngine {
  private state: EngineState;
  private opts: EngineOpts;
  private listeners = new Set<EngineListener>();
  private currentRenderedAt = 0;
  /** The Seer instance, created when the user submits their intention.
   *  Survey UI waits on seer.ready before showing the [ENTER] button;
   *  App routes to Reading with the Seer in hand. */
  private seer: Seer | null = null;
  /** Each pipeline run is a single Promise<void> covering Observer →
   *  Detective → Interrogator, all serial. The UI watches the count to
   *  show the spinner when queue is empty + a pipeline is running. */
  private pipelinesInFlight = 0;
  /** Per-agent in-flight counts. Published to debug bus per change. */
  private agentInFlight = { detective: 0, psych: 0 };
  private starterSeedFired = false;
  /** Snapshot of the engine state captured RIGHT BEFORE the most recent
   *  pick was processed. `undo()` restores this. Cleared after restore.
   *  One-level only — covers the "oops" case, not arbitrary rewind. */
  private previousState: EngineState | null = null;
  /** Monotonic counter that increments on every pick AND on every undo.
   *  Pipelines capture their epoch when spawned; on completion they
   *  check that the engine is still at the same epoch — if not, the
   *  pipeline's results are silently dropped (it was reasoning about a
   *  state that no longer exists). This is how we cut in-flight AI
   *  work loose after an undo without needing AbortController plumbing
   *  all the way through the adapter. */
  private pickEpoch = 0;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    this.state = opts.initialState ?? this.initState(opts);
    // When hydrated from initialState, mark the seeder as already fired
    // for any post-opener picks — otherwise loadFromSave-style restore
    // would re-seed the pillar queue on the next post-opener tick.
    if (opts.initialState) {
      this.starterSeedFired =
        opts.initialState.picks_log.length >
        opts.initialState.asked_node_ids.filter((id) => OPENER_NODE_IDS.has(id)).length;
    }
  }

  // ─── public API ──────────────────────────────────────

  getState(): EngineState {
    return this.state;
  }

  getCurrentQuestion(): RenderedQuestion | null {
    if (this.state.closed) return null;
    const head = this.state.queue[0];
    if (head) {
      this.currentRenderedAt = Date.now();
      return renderQueueItem(head, this.state.profile);
    }
    // Pillar queue exhausted → Interrogation. Render the head of
    // assertion_queue if there is one.
    const nextAssertion = this.state.assertion_queue[0];
    if (nextAssertion) {
      this.currentRenderedAt = Date.now();
      return {
        node_id: `assertion_${nextAssertion.idx}`,
        text: nextAssertion.statement,
        format: 'assertion',
        options: ['warm', 'cold'],
        preamble: undefined,
        instrument: {
          kind: 'assertion',
          statement: nextAssertion.statement,
          comment_if_warm: nextAssertion.comment_if_warm,
          comment_if_cold: nextAssertion.comment_if_cold,
        },
      };
    }
    return null;
  }

  /** True when the user has out-paced the pipeline: queue empty but a
   *  pipeline run is in flight. UI uses this to show a spinner rather
   *  than treating the survey as exhausted. */
  isWaitingForPipeline(): boolean {
    return !this.state.closed && this.state.queue.length === 0 && this.pipelinesInFlight > 0;
  }

  /** True iff there's a captured snapshot to undo back to. Drives the
   *  visibility of the UI's undo chevron. */
  canUndo(): boolean {
    return this.previousState !== null && !this.state.closed;
  }

  /** Restore the most recent snapshot. Cuts any in-flight AI work loose
   *  by bumping the pick epoch — pipelines that complete after this
   *  will check epoch parity and drop their results. One-level only;
   *  after undo, `canUndo()` returns false until the next pick. */
  undo(): void {
    if (!this.previousState) return;
    this.state = this.previousState;
    this.previousState = null;
    this.pickEpoch += 1;
    this.refreshThinking();
    this.emit();
  }

  async submitAnswer(answer: string | string[]): Promise<void> {
    if (this.state.closed) return;
    const head = this.state.queue[0];
    if (!head) {
      // Interrogation: the head is in assertion_queue.
      if (this.state.assertion_queue.length > 0) {
        this.submitAssertionResponse(answer);
      }
      return;
    }
    // Engine-authored items have no TREE.nodes entry — `node` will be
    // undefined and that's fine. We use renderQueueItem (which
    // dispatches on inline data) for the user-visible rendering and
    // the recorded pick. The only place we still need `node` is the
    // relationship_pick branch below — and engine-authored questions
    // are always 'choice' format, so that branch can't fire.
    const node = getNode(head.node_id);

    // Snapshot for undo. Capture BEFORE any mutation so undo restores
    // the exact pre-pick state. Deep clone via JSON to avoid sharing
    // nested refs (profile.cast, investigation.hypotheses, etc).
    this.previousState = JSON.parse(JSON.stringify(this.state)) as EngineState;
    this.pickEpoch += 1;

    const renderedAt = this.currentRenderedAt || Date.now();
    const answeredAt = Date.now();
    const latencyMs = answeredAt - renderedAt;

    // Capture the question + options EXACTLY as the user saw them — so
    // history reflects what was on screen, not what the basket says now.
    const renderedNow = renderQueueItem(head, this.state.profile);

    // v3: if this was an assertion-instrument pick, parse the answer
    // into a structured AssertionResult. Lets the debug panel +
    // future telemetry rig compute the confirmed / rejected /
    // rejected_with_correction rate without re-parsing answer strings.
    const isAssertion =
      head.instrument?.kind === 'assertion' || head.inline?.format === 'assertion';
    const assertionResult = isAssertion
      ? parseAssertionAnswer(answer)
      : null;

    const pick: PickEvent = {
      node_id: head.node_id,
      question_text: renderedNow.text,
      options_shown: renderedNow.options,
      answer,
      answered_at: answeredAt,
      latency_ms: latencyMs,
      prompted_by: head.prompted_by,
      // v2: propagate the QueueItem's is_engine_authored flag onto the
      // PickEvent. extractHooks filters these out so planted-option
      // text never becomes a "verbatim" hook the Seer echoes back.
      is_engine_authored: head.is_engine_authored,
      ...(assertionResult ? { instrument_result: assertionResult } : {}),
    };
    const timing: TimingEvent = {
      node_id: head.node_id,
      rendered_at: renderedAt,
      answered_at: answeredAt,
      latency_ms: latencyMs,
      revisions: 0,
      // Side-channel telemetry. Phase K wires UI capture of
      // interaction_count + initial_pick — until then we default to
      // 1 (one tap, no changes) with initial == final.
      interaction_count: 1,
      initial_pick: null,
      final_pick: answer,
    };

    // Defensive: a node should never be picked twice. If we somehow got
    // here with an already-asked node, log loudly and skip the second
    // recording (better than corrupting the picks_log).
    if (this.state.asked_node_ids.includes(head.node_id)) {
      console.warn(
        `[survey] node '${head.node_id}' was already asked. dropping duplicate. queue: ${this.state.queue.map((q) => q.node_id).join(',')}`,
      );
      this.setState({ queue: this.state.queue.slice(1) });
      this.emit();
      return;
    }

    // Per-pillar latency-z (deterministic, cheap — fold in now so the
    // detective sees z-scores inline in the transcript). Computes
    // against the full post-opener timing window each turn.
    const enrichedTiming = computeLatencyZScores([...this.state.timing_log, timing]);
    const justTiming = enrichedTiming[enrichedTiming.length - 1]!;

    // Push to transcript for post-opener picks (openers are identity
    // gathers, not part of the detective's narrative).
    const isOpener = OPENER_NODE_IDS.has(head.node_id);
    const transcriptEntries: TranscriptEntry[] = [...this.state.transcript];
    if (!isOpener) {
      const pillarIdx = this.countPostOpenerPicks() + 1; // 1-based
      transcriptEntries.push(pickToTranscriptEntry(pick, pillarIdx, justTiming.latency_z));
    }

    this.setState({
      picks_log: [...this.state.picks_log, pick],
      timing_log: enrichedTiming,
      asked_node_ids: [...this.state.asked_node_ids, head.node_id],
      queue: this.state.queue.slice(1),
      transcript: transcriptEntries,
    });

    // Assertion correction → log to verbatim + transcript. The detective
    // sees the response on its next pass.
    if (assertionResult) {
      const transcriptResp: TranscriptEntry = {
        kind: 'response',
        assertion_idx: this.countAssertionsInTranscript(),
        direction: assertionResult.direction,
        ...(assertionResult.correction ? { correction: assertionResult.correction } : {}),
        latency_ms: latencyMs,
      };
      this.setState({
        transcript: [...this.state.transcript, transcriptResp],
        ...(assertionResult.correction
          ? {
              verbatim_log: appendVerbatim(this.state.verbatim_log, {
                turn: this.countPostOpenerPicks(),
                source: 'correction',
                text: assertionResult.correction,
              }),
            }
          : {}),
      });
      // Pop the answered assertion from the queue + refill in background.
      if (this.state.assertion_queue.length > 0) {
        this.setState({
          assertion_queue: this.state.assertion_queue.slice(1),
        });
      }
      void this.refillAssertionQueue();
    }

    // Populate profile if this was an opener.
    this.applyOpenerDataIfRelevant(head.node_id, answer);

    // Process relationship_pick answers: parse the structured JSON
    // payload and add/update the CastMember on the profile.
    // Engine-authored items are always 'choice' format so node is
    // guaranteed non-null here when this branch matches.
    if (node && node.f === 'relationship_pick' && typeof answer === 'string') {
      this.applyRelationshipPick(head.node_id, answer);
    }

    this.setState({
      phase: derivePhase(this.state.phase, this.state.picks_log.length, false),
    });

    // Routing rule:
    //   - mid-opener-chain → walk to next opener; NO pipeline (openers
    //     don't trigger AI work — deterministic identity gathers).
    //   - end of openers → pre-roll the post-opener queue (Pillars +
    //     random pool). NO pipeline yet.
    //   - post-opener answer → spawn the pipeline. Detective is now an
    //     editor: it doesn't add questions, it edits options on the
    //     queue items the user hasn't reached yet.
    //   - if this answer drained the queue (and no pipelines pending),
    //     transition to awaiting_intention (IntentConfirm UI).
    if (OPENER_NODE_IDS.has(head.node_id)) {
      const enqueued = this.enqueueNextOpener(head.node_id);
      if (!enqueued) {
        this.seedPostOpenerQueue();
      }
    } else {
      // Algorithmic seeder runs BEFORE the pipeline fires: age existing
      // tentative + held hypotheses by 1, then push fresh seeds from the
      // question's Inversions probe into tentative[]. The pipeline's
      // detective payload includes the new ladder, so the model sees
      // them this turn (and can elevate, hold, or refute via the
      // hypothesis_updates output — until Phase H rewrites the
      // detective output schema).
      this.applySeeder(head.node_id, pick);
      this.spawnPipeline(pick);

      // Transition to IntentConfirm when there's nothing more to ask.
      // v3: pillars exhaust → detective drives assertions until the
      // POST_PILLAR_ASSERTION_CAP, then we finalize. The pipeline this
      // turn may still enqueue an assertion (detective hasn't returned
      // yet) — so when the queue is empty we defer to
      // maybeTriggerIntentionOnStall, which waits for the pipeline.
      const postOpenerCount = this.countPostOpenerPicks();
      const queueEmpty = this.state.queue.length === 0;
      const assertionCount = this.countAssertionPicks();
      const overAssertionCap = assertionCount >= POST_PILLAR_ASSERTION_CAP;
      if (queueEmpty && postOpenerCount > 0 && overAssertionCap) {
        // Hard cap: even if the detective wants more, we're done.
        this.beginIntentionStage();
      }
    }

    this.refreshThinking();
    this.emit();
  }

  /** Number of post-opener questions the user has answered. */
  private countPostOpenerPicks(): number {
    return this.state.picks_log.filter((p) => !OPENER_NODE_IDS.has(p.node_id)).length;
  }

  /** v3: number of assertion-instrument picks the user has answered.
   *  Used to enforce POST_PILLAR_ASSERTION_CAP. */
  private countAssertionPicks(): number {
    return this.state.picks_log.filter((p) => p.instrument_result !== undefined).length;
  }

  /** Apply the algorithmic seeder for a fresh post-opener pick.
   *  v2: writes Probe seeds directly into doc.held (ageing on every
   *  turn). The 6-rung tentative/held split is gone; held is the
   *  single bucket of unresolved probes. Observer can elevate (move
   *  claim into scaffold.axes / leading_hypothesis) or refute (clear
   *  from held). Bumps doc.v.
   *
   *  Every doc write bumps v — this makes the based_on_v staleness
   *  gate (Phase 3) a real assertion not dead code. */
  private applySeeder(nodeId: string, pick: PickEvent): void {
    const node = getNode(nodeId);
    if (!node) return;
    const turn_n = this.state.picks_log.length;
    const aged = ageHeldProbes(this.state.doc.held);
    const seeds = generateSeeds(node, pick.answer, turn_n, nodeId);
    if (seeds.length === 0 && aged === this.state.doc.held) {
      return;
    }
    // Upsert seeds into held (by id — same seed-key collides cleanly).
    const seedIds = new Set(seeds.map((s) => s.id));
    const heldNoCollisions = aged.filter((p) => !seedIds.has(p.id));
    const nextHeld = [...heldNoCollisions, ...seeds];
    this.setState({
      doc: {
        ...this.state.doc,
        v: this.state.doc.v + 1,
        held: nextHeld,
      },
    });
  }

  // questionCap removed — queue exhaustion is the close trigger now.

  // ─── End-of-survey stages ────────────────────────────

  /** Sync transition from questions → awaiting_intention. No LLM call.
   *  The user provides their own intention via the IntentConfirm UI;
   *  the engine doesn't guess. */
  /** Survey questions are done — run the end-of-survey synthesis
   *  (final observer pass + algorithmic extraction), then transition
   *  to awaiting_intention. This is what produces the "saved" snapshot
   *  the Person record persists. Augur is deferred to submitIntention
   *  (it depends on the intention text). */
  private beginIntentionStage(): void {
    if (this.state.stage !== 'questions') return;   // idempotent

    // v3: dead-end gate. Before running the full close pipeline, check
    // whether content-level signals say the hunt found nothing. If so,
    // route to null_landing instead — no intention prompt, no augur,
    // no seer. Phase 2 wires the scaffold; the only signal source live
    // today is distribution flatness, conservatively thresholded.
    const deadEnd = checkDeadEndSignals({
      post_opener_turn: this.countPostOpenerPicks(),
      coverage: this.state.doc.coverage,
      picks: this.state.picks_log,
    });
    if (deadEnd.fired) {
      this.beginNullLanding(deadEnd.reasons);
      return;
    }

    this.setState({ stage: 'finalizing', thinking: true });
    this.emit();
    void (async () => {
      try {
        // Latency-z extraction (deterministic, fast). The compiler
        // no longer runs here — it has moved AFTER intention submit
        // so it can filter the PSYCH candidate set through the user's
        // own framing. See submitIntention.
        this.applyAlgoExtraction();
        // Block on any still-running PSYCH so the intent screen +
        // compiler both see the freshest candidate set.
        await this.waitForPsychQuiescence();
      } catch (e) {
        console.warn('[survey] finalize failed', e);
      }
      this.setState({ stage: 'awaiting_intention', thinking: false });
      this.emit();
    })();
  }

  /** Seeder agent — Haiku, fires after each pillar answer. Returns a
   *  list of free-form observation lines that get appended to both
   *  doc.seeder_notes (legacy compiler input) and the transcript
   *  (interleaved as the detective's peripheral-vision data). */
  private async runSeederTask(pick: PickEvent): Promise<void> {
    try {
      const lines = await runSeeder(this.opts.adapter, {
        state: this.state,
        pick,
      });
      if (lines.length === 0) return; // silence is fine
      const pillarIdx = this.countPostOpenerPicks();
      this.setState({
        doc: {
          ...this.state.doc,
          v: this.state.doc.v + 1,
          seeder_notes: [...this.state.doc.seeder_notes, ...lines],
        },
        transcript: [
          ...this.state.transcript,
          { kind: 'seeder_obs', after_pillar_idx: pillarIdx, lines },
        ],
      });
      this.emit();
    } catch (e) {
      console.warn('[survey] seeder failed', e);
    }
  }

  /** Compiler-as-sieve. Runs ONCE per session, AFTER the user submits
   *  their intention. Reads transcript + PSYCH candidates + the user's
   *  intention; returns a structured DilemmaDocument. The engine
   *  renders it to a markdown anchor for persistence + the legacy
   *  Seer profile-assembly path. */
  private async runCompilerTask(user_intention: string | null): Promise<DilemmaDocument | null> {
    const prev_anchor = this.state.anchor;
    try {
      const dilemma = await runCompiler(
        this.opts.adapter,
        { state: this.state, user_intention },
        {
          onStart: () => publishCompilerStream({ kind: 'start' }),
          onThinking: (chunk) => publishCompilerStream({ kind: 'thinking', chunk }),
          onToolInput: (chunk) => publishCompilerStream({ kind: 'tool_input', chunk }),
          onEnd: () => publishCompilerStream({ kind: 'end' }),
        },
      );
      const anchor = renderDilemmaAsAnchor(dilemma);
      this.setState({ dilemma, anchor });
      this.emit();
      publishAnchor({
        turn: this.countPostOpenerPicks(),
        trigger: 'close',
        anchor,
        diff: diffAnchors(prev_anchor, anchor),
      });
      console.info(
        `[survey] compiler: label=${dilemma.label}, path=${dilemma.resolution_path}, null=${dilemma.null_landing} — ${dilemma.reasoning}`,
      );
      return dilemma;
    } catch (e) {
      console.warn('[survey] compiler failed', e);
      return null;
    }
  }

  /** v3: dead-end terminal stage. Skips intention / augur / seer
   *  entirely. Logs the reason set so the debug panel can surface why
   *  the engine landed null. Phase 2 just transitions cleanly; Phase 3+
   *  may eventually back this with a "light reading" mode in the seer
   *  (the plan flags this as out of scope for the survey refactor). */
  private beginNullLanding(reasons: readonly string[]): void {
    if (this.state.stage !== 'questions') return;
    console.info('[survey] null landing —', reasons.join(', '));
    this.setState({
      stage: 'null_landing',
      thinking: false,
      closed: true,
      close_reason: 'dead_end_signals',
    });
    this.emit();
  }

  /** Hydrate the engine directly from a saved Person record and jump to
   *  awaiting_intention. Skips all questions + the synthesis pass — the
   *  saved snapshot IS the post-synthesis state. Caller must ensure the
   *  saved record has profile + doc + picks_log (schema_version 2). */
  loadFromSave(args: {
    profile: SurveyProfile;
    doc: LivingDoc;
    anchor?: string;
    verbatim_log?: VerbatimEntry[];
    picks_log: PickEvent[];
    timing_log?: TimingEvent[];
    prior_intentions?: string[];
  }): void {
    this.setState({
      profile: args.profile,
      doc: args.doc,
      anchor: args.anchor ?? '',
      verbatim_log: args.verbatim_log ?? [],
      picks_log: args.picks_log,
      timing_log: args.timing_log ?? [],
      asked_node_ids: args.picks_log.map((p) => p.node_id),
      queue: [],
      is_returning_user: true,
      prior_intentions: args.prior_intentions ?? [],
      stage: 'awaiting_intention',
      thinking: false,
      closed: false,
    });
    this.emit();
  }

  /** User picked (or wrote in) their intention. Instantiates the Seer
   *  with the survey case file + intention + a fresh card draw. The
   *  Seer's constructor kicks off its intro pipeline (director →
   *  actor); UI gates the [ENTER] button on seer.ready. */
  submitIntention(text: string): void {
    const cleaned = text.trim();
    if (!cleaned) return;
    if (this.state.stage !== 'awaiting_intention') return;

    // Snapshot for undo — covers the IntentConfirm screen too.
    // Restoring this snapshot puts the user back in awaiting_intention.
    this.previousState = JSON.parse(JSON.stringify(this.state)) as EngineState;
    this.pickEpoch += 1;

    this.setState({
      chosen_intention: cleaned,
      stage: 'compiling',         // covers final observer + Augur + Seer-construction loading
      thinking: true,
      verbatim_log: appendVerbatim(this.state.verbatim_log, {
        turn: this.state.picks_log.filter((p) => !OPENER_NODE_IDS.has(p.node_id)).length,
        source: 'intent',
        text: cleaned,
      }),
    });
    this.emit();

    const drawn = drawForSpread(FOUR_CARD_DIAMOND);

    // Compiler-as-sieve, then Augur, then build the Seer. The compiler
    // is gated on state.anchor being empty — loaded sessions
    // (loadFromSave) already carry an anchor from the prior visit.
    void (async () => {
      try {
        if (!this.state.anchor) {
          await this.runCompilerTask(cleaned);
        }
        // v2: held probes live at doc.held (Probe shape, not Hypothesis).
        // Sort by age DESC so the closing director sees the most-durable
        // probes first.
        const heldProbes = [...this.state.doc.held]
          .sort((a, b) => (b.age_in_turns ?? 0) - (a.age_in_turns ?? 0));
        const profile = assembleProfile(this.state, '');
        const outcomes = await runAugur(this.opts.adapter, {
          profile,
          intention: cleaned,
          surveyHistory: this.state.picks_log,
          story: this.state.doc.story,
          heldProbes,
        });
        // Seam: Seer accepts Hypothesis[] (legacy shape with .description).
        // v2 doc.held is Probe[] (.claim). Map at the boundary so the
        // Seer code stays untouched. Phase 3/4 may collapse the rename.
        const heldProbesForSeer = heldProbes.map((p) => ({
          id: p.id,
          description: p.claim,
          age_in_turns: p.age_in_turns,
        }));
        this.seer = new Seer({
          adapter: this.opts.adapter,
          profile,
          surveyHistory: this.state.picks_log,
          intention: cleaned,
          drawn,
          outcomes,
          story: this.state.doc.story,
          heldProbes: heldProbesForSeer,
        });
        await this.seer.ready;
        this.setState({
          closed: true,
          close_reason: 'cap',
          stage: 'reading_ready',
          thinking: false,
        });
        this.emit();
      } catch (err) {
        console.warn('[survey] compile pipeline failed', err);
        this.setState({ thinking: false });
        this.emit();
      }
    })();
  }

  /** Latency-z extraction over timing_log. Deterministic, fast.
   *  Telemetry only — the seeder + detective + compiler don't read
   *  z-scores; this writes them into the export bundle. */
  private applyAlgoExtraction(): void {
    const enrichedTiming = computeLatencyZScores(this.state.timing_log);
    this.setState({ timing_log: enrichedTiming });
  }

  /** Exposed to App once stage === 'reading_ready'. App routes to the
   *  Reading screen with this Seer instance. */
  getSeer(): Seer | null {
    return this.seer;
  }

  // (confirmReturningPerson removed. The new flow uses loadFromSave —
  //  RESUME on the name-match modal hydrates from the saved snapshot
  //  and jumps straight to awaiting_intention. No mid-flight fold.)

  /** UI confirmed START FRESH on the modal. No engine state to flip —
   *  we were already in new-user mode. Exposed for symmetry and so the
   *  Survey component has a clear callback to wire up. */
  confirmStartFresh(): void {
    // intentional no-op
  }

  /** User clicked "ready for the cards" before the question cap. Skip
   *  remaining queued questions and jump to the shaman step. */
  skipAhead(): void {
    if (this.state.stage !== 'questions') return;
    // Drop queued questions — user is done answering.
    this.setState({ queue: [], close_reason: 'user_exit' });
    this.beginIntentionStage();
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Compiler accessors removed — the survey hands off via getSeer().

  /** Await all in-flight pipelines. Useful for tests that need a
   *  quiet state. Returns when no observer/detective/interrogator is
   *  running and no new run is queued. */
  async waitForQuiescence(maxWaitMs = 30000): Promise<void> {
    const start = Date.now();
    while (this.pipelinesInFlight > 0 && Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  // ─── state mutation ──────────────────────────────────

  private setState(partial: Partial<EngineState>): void {
    this.state = { ...this.state, ...partial };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // listener crash is its problem, not ours
      }
    }
  }

  // ─── init ────────────────────────────────────────────

  private initState(opts: EngineOpts): EngineState {
    const startProfile: SurveyProfile = {
      name: '',
      birthday: null,
      sun_sign: null,
      life_path: null,
      birth_card: null,
      age_bracket: null,
      birth_time_bracket: null,
      relationship_status: null,
      initial_intention: null,
      cast: [],
      ...(opts.returning?.profile_seed ?? {}),
    };
    // v2: LivingDoc replaces Investigation. Observer (Phase 3+)
    // single-writes; detective reads + emits Moves; coverage is
    // recomputed deterministically. EMPTY_DOC is the initial state.
    const startDoc: LivingDoc = EMPTY_DOC;
    const isReturning = !!opts.returning;

    const firstUnsatisfied = getOpeners().find(
      (id) => !this.isOpenerSatisfiedFor(id, startProfile),
    );
    const openerQueue: QueueItem[] = firstUnsatisfied
      ? [{ node_id: firstUnsatisfied, prompted_by: null, priority: 'high' }]
      : [];

    return {
      session_id: opts.session_id ?? generateSessionId(),
      started_at: Date.now(),
      tree_version: TREE.v,
      profile: startProfile,
      doc: startDoc,
      is_returning_user: isReturning,
      prior_answered_node_ids: opts.returning?.answered_node_ids ?? [],
      prior_intentions: opts.returning?.prior_intentions ?? [],
      prior_session_summary: opts.returning?.prior_session_summary,
      queue: openerQueue,
      picks_log: [],
      timing_log: [],
      asked_node_ids: [],
      heat: 0,
      heat_history: [],
      phase: 'A',
      closed: false,
      thinking: false,
      stage: 'questions',
      intentions_offered: [],
      chosen_intention: null,
      anchor: '',
      verbatim_log: [],
      transcript: [],
      detective_thinking: '',
      hypotheses: [],
      assertion_queue: [],
      psych_candidates: [],
      psych_terminate: false,
      psych_run_count: 0,
      dilemma: null,
    };
  }

  private isOpenerSatisfiedFor(node_id: string, profile: SurveyProfile): boolean {
    switch (node_id) {
      case 'name':         return profile.name.trim().length > 0;
      case 'birthday':     return profile.birthday !== null;
      case 'birth_time':   return profile.birth_time_bracket !== null;
      case 'relationship': return profile.relationship_status !== null;
      // intent opener: satisfied once the user has answered it ONCE
      // (initial_intention may legitimately be null when they pressed
      // "I DON'T KNOW"). We track that they answered via picks_log /
      // asked_node_ids, but for opener-chain advance, treat as satisfied
      // by the node_id being asked — handled by the queue.
      case 'intent':       return false;
      default:             return false;
    }
  }

  /** Process a relationship_pick answer: parse the JSON payload and
   *  upsert the CastMember on the profile (off_limits, pronouns, color). */
  private applyRelationshipPick(node_id: string, rawAnswer: string): void {
    let parsed: {
      category?: string;
      name?: string;
      off_limits?: boolean;
      pronouns?: { subjective: 'he' | 'they' | 'she'; objective: 'him' | 'them' | 'her' };
      color?: string;
    };
    try {
      parsed = JSON.parse(rawAnswer);
    } catch {
      return;
    }
    const name = (parsed.name ?? '').trim();
    if (!name) return;
    // 'self' pick: the user nominated themselves as the relational
    // anchor. The answer is recorded in picks_log (downstream agents
    // see the pick), but we don't upsert the user into their own cast
    // — they're not a separate cast member to track.
    if (parsed.category === 'self') return;
    const offLimits = !!parsed.off_limits;
    const role = parsed.category && parsed.category !== 'existing'
      ? parsed.category
      : undefined;
    const pronouns = parsed.pronouns;
    const color = parsed.color;

    const existing = this.state.profile.cast.find(
      (m) => m.label.trim().toLowerCase() === name.toLowerCase(),
    );
    let nextCast = this.state.profile.cast.slice();
    if (existing) {
      nextCast = nextCast.map((m) =>
        m === existing
          ? {
              ...m,
              likely_role: role ?? m.likely_role,
              supporting_picks: m.supporting_picks.includes(node_id)
                ? m.supporting_picks
                : [...m.supporting_picks, node_id],
              off_limits: offLimits || !!m.off_limits,
              pronouns: pronouns ?? m.pronouns,
              color: color ?? m.color,
            }
          : m,
      );
    } else {
      nextCast.push({
        label: name,
        likely_role: role,
        supporting_picks: [node_id],
        confidence: 'high',
        off_limits: offLimits,
        pronouns,
        color,
      });
    }
    // Capture the verbatim name only when it's a NEW cast addition —
    // returning users picking an existing person from the list don't
    // type anything fresh worth logging.
    const nextLog = existing
      ? this.state.verbatim_log
      : appendVerbatim(this.state.verbatim_log, {
          turn: this.state.picks_log.filter((p) => !OPENER_NODE_IDS.has(p.node_id)).length,
          source: 'relationship_label',
          text: name,
        });
    this.setState({
      profile: { ...this.state.profile, cast: nextCast },
      verbatim_log: nextLog,
    });
  }

  /** Apply opener data to profile. Auto-detect of returning users moved
   *  out: the UI runs `findPeopleMatchingName` after the name submit
   *  and shows a RESUME / START FRESH modal. On confirm, the UI calls
   *  `confirmReturningPerson()` on the engine. */
  private applyOpenerDataIfRelevant(node_id: string, answer: string | string[]): boolean {
    const ans = typeof answer === 'string' ? answer : answer[0];
    if (!ans) return false;

    if (node_id === 'name') {
      const cleaned = ans.trim();
      this.setState({
        profile: { ...this.state.profile, name: cleaned },
        verbatim_log: appendVerbatim(this.state.verbatim_log, {
          turn: 0,
          source: 'name',
          text: cleaned,
        }),
      });
      return false;
    }
    if (node_id === 'birthday') {
      const parsed = parseBirthDate(ans);
      if (!parsed) return false;
      const astro = computeAstroProfile(parsed);
      this.setState({
        profile: {
          ...this.state.profile,
          birthday: parsed,
          sun_sign: astro.sunSign,
          life_path: astro.lifePath,
          birth_card: { number: astro.tarotBirthCard.number, name: astro.tarotBirthCard.name },
          age_bracket: computeAgeBracket(parsed),
        },
      });
      return false;
    }
    if (node_id === 'birth_time') {
      this.setState({ profile: { ...this.state.profile, birth_time_bracket: mapBirthTime(ans) } });
      return false;
    }
    if (node_id === 'relationship') {
      // "prefer not to say" maps to null so downstream consumers can
      // treat it the same as "we don't know" instead of as a value.
      const v = ans.trim().toLowerCase();
      const stored = v === 'prefer not to say' ? null : (v as SurveyProfile['relationship_status']);
      this.setState({ profile: { ...this.state.profile, relationship_status: stored } });
      return false;
    }
    if (node_id === 'intent') {
      // The IntentForm submits the user's typed question, OR an empty
      // string when they pressed "I DON'T KNOW". Empty → null.
      const trimmed = (typeof answer === 'string' ? answer : answer[0] ?? '').trim();
      this.setState({
        profile: {
          ...this.state.profile,
          initial_intention: trimmed.length > 0 ? trimmed : null,
        },
        verbatim_log: appendVerbatim(this.state.verbatim_log, {
          turn: 0,
          source: 'intent',
          text: trimmed,
        }),
      });
      return false;
    }
    return false;
  }

  /** Pre-roll the post-opener queue.
   *
   *  v3 (Phase 3+): pillars only. The random pool is gone from the
   *  pre-roll; post-pillar questions come from detective-emitted
   *  assertion instruments. The pool questions still live in
   *  materials/survey.md as reference material for the detective's
   *  prior, but they're not queued directly anymore.
   *
   *  Returning users get a lite-mode 6 random pool draws only
   *  (dedup'd against prior history) — they've already sat through
   *  the pillars on a prior visit, and we want a quick re-orient
   *  rather than a full re-hunt.
   *
   *  Idempotent — only fires once per session. */
  private seedPostOpenerQueue(): void {
    if (this.starterSeedFired) return;
    this.starterSeedFired = true;

    const priorAnswered = new Set(this.state.prior_answered_node_ids);

    if (this.state.is_returning_user) {
      // Lite mode: 6 random pool draws, dedup'd against prior visits.
      // (Returning-user flow stays pool-based for now — the Phase 4
      // walkthrough will decide whether to switch them to assertions
      // too, or keep the lighter touch.)
      const pool = getPoolNodeIds().filter(
        (id) => !this.state.asked_node_ids.includes(id) && !priorAnswered.has(id),
      );
      const shuffled = shuffleInPlace([...pool]).slice(0, 6);
      for (const id of shuffled) {
        this.enqueueDirect(id, null, null);
      }
      return;
    }

    // First-visit flow: pillars in order. Pool is gone — the detective
    // emits assertions to fill post-pillar turns.
    for (const id of getPillars()) {
      this.enqueueDirect(id, null, null);
    }
  }

  /** Push per-agent + total pipeline counts to the debug bus. */
  private publishInflight(): void {
    publishDebug('survey.inflight', this.pipelinesInFlight);
    publishDebug('survey.agent.detective', this.agentInFlight.detective);
    publishDebug('survey.agent.psych', this.agentInFlight.psych);
  }

  /** `thinking` is the UI's "we have nothing to show, wait" hint. True
   *  when an agent is in flight AND no question is currently rendered. */
  private refreshThinking(): void {
    const queueEmpty = this.state.queue.length === 0;
    const anyInFlight = this.pipelinesInFlight > 0;
    const thinking = queueEmpty && anyInFlight;
    if (thinking !== this.state.thinking) this.setState({ thinking });
  }

  private enqueueDirect(
    node_id: string,
    promptedBy: string | null,
    preamble: string | null,
    optionsOverride?: string[],
  ): void {
    // Defensive dedupe — never enqueue a node that's already in the queue or
    // already been asked.
    if (this.state.asked_node_ids.includes(node_id)) return;
    if (this.state.queue.some((q) => q.node_id === node_id)) return;
    this.setState({
      queue: [
        ...this.state.queue,
        {
          node_id,
          prompted_by: promptedBy,
          priority: 'normal',
          preamble: preamble ?? undefined,
          options_override: optionsOverride,
        },
      ],
    });
  }

  /** Walk the opener chain: given the just-answered opener, enqueue the
   *  next one in the openers[] order. Returns true if an opener was
   *  enqueued, false if the chain is done. No preamble — openers are
   *  data intake, not AI-narrated. */
  private enqueueNextOpener(prevOpenerId: string): boolean {
    const openers = getOpeners();
    const idx = openers.indexOf(prevOpenerId);
    if (idx < 0 || idx >= openers.length - 1) return false;
    const next = openers[idx + 1];
    if (!next || this.state.asked_node_ids.includes(next)) return false;
    this.enqueueDirect(next, null, null);
    return true;
  }

  // ─── pipeline ────────────────────────────────────────
  //
  // Per non-opener answer: spawn one background pipeline that runs
  // Observer → Detective → Interrogator serially. Each agent gets a
  // PipelineContext mutated in-place by the previous one. Every stage
  // updates engine state the moment it finishes — the UI sees profile
  // updates after observer, investigation + queue edits after detective.
  //
  // (basket removed — the detective no longer picks questions. The
  // queue is pre-rolled at openers-end via seedPostOpenerQueue.)

  private spawnPipeline(pick: PickEvent): void {
    this.pipelinesInFlight += 1;
    this.publishInflight();
    this.refreshThinking();
    void this.runPipeline(pick).finally(() => {
      this.pipelinesInFlight -= 1;
      this.publishInflight();
      this.refreshThinking();
      this.maybeTriggerIntentionOnStall();
      this.emit();
    });
  }

  /** Belt-and-suspenders close trigger. If async pipelines complete AFTER
   *  the user has consumed every queue item, this fires the intention
   *  stage. Mirrors the inline check in submitAnswer. */
  private maybeTriggerIntentionOnStall(): void {
    if (this.state.stage !== 'questions') return;
    if (this.state.queue.length > 0) return;
    if (this.pipelinesInFlight > 0) return;
    if (this.countPostOpenerPicks() === 0) return;
    this.beginIntentionStage();
  }

  /** Interrogation-pivot pipeline. Pillar phase = seeder only. Last
   *  pillar answer kicks off the Interrogation detective queue. The
   *  detective then drives until the assertion soft-ceiling, when the
   *  engine routes to close. */
  private async runPipeline(pick: PickEvent): Promise<void> {
    if (this.state.is_returning_user) return; // lite mode

    const postOpenerCount = this.countPostOpenerPicks();
    const pillarFloor = getPillars().length;

    if (postOpenerCount <= pillarFloor) {
      // PILLAR phase: seeder only.
      await this.runSeederTask(pick);
      // If the user just answered the LAST pillar, transition to
      // Interrogation and kick off the detective queue fill.
      if (postOpenerCount === pillarFloor) {
        void this.refillAssertionQueue();
      }
    }
    // Else: Interrogation. The detective fires from refillAssertionQueue
    // which is triggered after each assertion answer (and after the
    // last pillar above). No per-turn seeder during Interrogation.
  }

  /** User answered a queued assertion (Interrogation phase). Parse
   *  warmer/colder + optional correction, push to transcript +
   *  verbatim log, pop the queue, refill. */
  private submitAssertionResponse(answer: string | string[]): void {
    const head = this.state.assertion_queue[0];
    if (!head) return;
    const parsed = parseAssertionAnswer(answer);
    if (!parsed) return;
    const renderedAt = this.currentRenderedAt || Date.now();
    const answeredAt = Date.now();
    const latencyMs = answeredAt - renderedAt;

    // Snapshot for undo.
    this.previousState = JSON.parse(JSON.stringify(this.state)) as EngineState;
    this.pickEpoch += 1;

    const respEntry: TranscriptEntry = {
      kind: 'response',
      assertion_idx: head.idx,
      direction: parsed.direction,
      ...(parsed.correction ? { correction: parsed.correction } : {}),
      latency_ms: latencyMs,
    };
    const transcriptWithAssertionVoiced: TranscriptEntry[] = [
      ...this.state.transcript,
      // Tag the assertion as voiced (it was the head of the queue when
      // the user saw it).
      { kind: 'assertion', assertion_idx: head.idx, statement: head.statement },
      respEntry,
    ];
    this.setState({
      transcript: transcriptWithAssertionVoiced,
      assertion_queue: this.state.assertion_queue.slice(1),
      ...(parsed.correction
        ? {
            verbatim_log: appendVerbatim(this.state.verbatim_log, {
              turn: this.countPostOpenerPicks(),
              source: 'correction',
              text: parsed.correction,
            }),
          }
        : {}),
    });
    this.emit();

    // PSYCH fires every PSYCH_CADENCE answered assertions. Background —
    // doesn't block the next detective pass. waitForPsychQuiescence at
    // close gates the compiler on the freshest candidate set.
    const responses = this.countResponsesInTranscript();
    if (responses > 0 && responses % PSYCH_CADENCE === 0 && !this.state.psych_terminate) {
      void this.runPsychTask();
    }

    // Refill the assertion queue in the background.
    void this.refillAssertionQueue();
  }

  /** Single detective pass — calls runDetective, parses the text-blob,
   *  appends thinking to the running transcript, updates the
   *  hypothesis list (re-listing as votes — frequency = confidence),
   *  enqueues the next assertion. Idempotent in the sense that if the
   *  detective returns nothing usable, state is left untouched. */
  private async runDetectivePass(): Promise<boolean> {
    this.agentInFlight.detective += 1; this.publishInflight();
    try {
      const blob = await runDetective(this.opts.adapter, { state: this.state });
      const nextIdx = this.countAssertionsInTranscript() + this.state.assertion_queue.length + 1;
      const queued = blobToQueuedAssertion(blob, nextIdx, this.countPostOpenerPicks());
      if (!queued) {
        // No assertion this turn — detective bailed. Still append the
        // thinking + hypothesis snapshot so the next call sees them.
        this.setState({
          detective_thinking: this.state.detective_thinking
            + (this.state.detective_thinking ? '\n\n' : '')
            + blob.thinking,
          hypotheses: blob.hypotheses.length > 0 ? blob.hypotheses : this.state.hypotheses,
        });
        this.emit();
        return false;
      }
      this.setState({
        detective_thinking: this.state.detective_thinking
          + (this.state.detective_thinking ? '\n\n' : '')
          + blob.thinking,
        hypotheses: blob.hypotheses,
        assertion_queue: [...this.state.assertion_queue, queued],
      });
      this.emit();
      return true;
    } catch (e) {
      console.warn('[survey] detective pass failed', e);
      return false;
    } finally {
      this.agentInFlight.detective -= 1; this.publishInflight();
    }
  }

  /** Refill the assertion queue to LOOKAHEAD_CAP. Loops detective
   *  calls in the background. Stops when the cap is reached, a pass
   *  fails to emit an assertion, the total interrogation assertion
   *  count hits the soft ceiling, or PSYCH signals terminate
   *  (engagement read says the room has gone flat). */
  private async refillAssertionQueue(): Promise<void> {
    while (
      this.state.assertion_queue.length < LOOKAHEAD_CAP
      && (this.countAssertionsInTranscript() + this.state.assertion_queue.length) < INTERROGATION_SOFT_CEILING
      && !this.state.psych_terminate
    ) {
      const ok = await this.runDetectivePass();
      if (!ok) break;
    }
    // Close conditions: queue drained AND either ceiling reached or
    // PSYCH signalled stop.
    const hitCeiling = this.countAssertionsInTranscript() >= INTERROGATION_SOFT_CEILING;
    const psychSaidStop = this.state.psych_terminate;
    if (this.state.assertion_queue.length === 0 && (hitCeiling || psychSaidStop)) {
      this.beginIntentionStage();
    }
  }

  /** Single PSYCH pass — Haiku, fires every PSYCH_CADENCE answered
   *  assertions. Replaces psych_candidates wholesale (re-listing-as-
   *  vote is implicit). May signal psych_terminate when the candidate
   *  set has gone flat AND user responses have gone flat. */
  private async runPsychTask(): Promise<void> {
    this.agentInFlight.psych += 1;
    this.publishInflight();
    try {
      const blob = await runPsych(this.opts.adapter, {
        state: this.state,
        run_total: PSYCH_TOTAL_RUNS,
      });
      this.setState({
        psych_candidates: blob.candidates,
        psych_terminate: this.state.psych_terminate || blob.terminate, // sticky
        psych_run_count: this.state.psych_run_count + 1,
      });
      this.emit();
    } catch (e) {
      console.warn('[survey] psych pass failed', e);
    } finally {
      this.agentInFlight.psych -= 1;
      this.publishInflight();
    }
  }

  /** Block until no PSYCH call is in flight. Used in beginIntentionStage
   *  so the compiler reads the freshest candidate set. Bounded so a
   *  hung Haiku call doesn't wedge the close path. */
  private async waitForPsychQuiescence(maxMs = 15000): Promise<void> {
    const start = Date.now();
    while (this.agentInFlight.psych > 0 && Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /** Count detective-voiced assertions already in the transcript
   *  (i.e., the user has seen them). Used for the soft ceiling. */
  private countAssertionsInTranscript(): number {
    return this.state.transcript.filter((e) => e.kind === 'assertion').length;
  }

  /** Count user responses to assertions in the transcript. Used to
   *  pace PSYCH (fires every PSYCH_CADENCE responses). */
  private countResponsesInTranscript(): number {
    return this.state.transcript.filter((e) => e.kind === 'response').length;
  }
}

/** Lookahead depth — the detective keeps up to this many assertions
 *  pre-generated in the queue. Latency hiding + exploration pressure. */
const LOOKAHEAD_CAP = 3;

/** Soft ceiling on voiced assertions across the Interrogation. The
 *  hard cap (POST_PILLAR_ASSERTION_CAP) is the safety net above it. */
const INTERROGATION_SOFT_CEILING = 6;

/** PSYCH cadence — fires every N answered assertions during the
 *  Interrogation. Three runs expected across a 6-assertion ceiling. */
const PSYCH_CADENCE = 2;

/** Expected total PSYCH calls. Surfaced to PSYCH's prompt for
 *  explore→consolidate calibration. */
const PSYCH_TOTAL_RUNS = Math.max(1, Math.floor(INTERROGATION_SOFT_CEILING / PSYCH_CADENCE));

// ─── helpers (module-local) ─────────────────────────────

function generateSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function computeAgeBracket(birthday: { year: number; month: number; day: number }): string {
  const now = new Date();
  const beforeBirthday =
    now.getMonth() + 1 < birthday.month ||
    (now.getMonth() + 1 === birthday.month && now.getDate() < birthday.day);
  const age = now.getFullYear() - birthday.year - (beforeBirthday ? 1 : 0);
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

function mapBirthTime(ans: string): 'morning' | 'afternoon_evening' | 'overnight' | 'unknown' {
  if (ans.includes('morning')) return 'morning';
  if (ans.includes('afternoon')) return 'afternoon_evening';
  if (ans.includes('overnight')) return 'overnight';
  return 'unknown';
}

/** Fisher-Yates in-place shuffle. */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// applyQueueEdits removed — the detective still emits queue_edits but
// the engine no longer applies them (see runDetectiveTask). This helper
// can come back once the re-apply path is guarded against stale edits.


// ─── test-only re-exports ────────────────────────────────
//
// v2 apply helpers live in per-agent apply.ts files. Re-export here
// so unit tests can target them directly without going through engine
// state machine setup. Production code SHOULD import from the
// per-agent folders, not from engine.ts.

export { computeLatencyZScores as __test_computeLatencyZScores } from './algoExtract';
