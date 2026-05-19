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
import { runObserver } from './agents/observer';
import { runDetective } from './agents/detective';
import { runAugur } from './agents/augur';
import { Seer } from '../seer';
import { drawForSpread } from '../cards';
import { FOUR_CARD_DIAMOND } from '../spreads';
import { assembleProfile } from './profile-assembly';
import { computeAstroProfile, parseBirthDate } from '../astrology';
import type { ReturningMatch } from './returning';
import { publishDebug } from '../../debug/debugBus';
import {
  getNode,
  getOpeners,
  getPillars,
  getPoolNodeIds,
  renderQuestion,
  TREE,
} from './tree';
import { derivePhase } from './phase';
import type {
  CastMember,
  EngineListener,
  EngineState,
  Hypothesis,
  Investigation,
  Note,
  ObserverOutput,
  DetectiveOutput,
  PickEvent,
  PipelineContext,
  QueueItem,
  RenderedQuestion,
  SurveyProfile,
  TimingEvent,
} from './types';

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
};

const OPENER_NODE_IDS = new Set<string>(getOpeners());

/** Returning-user lite mode draws exactly this many random pool questions
 *  (dedup'd against prior history). No Pillars on returning visits. */
export const RETURNING_LITE_COUNT = 6;
/** New-user surveys queue this many random pool questions after the 6
 *  Pillars. Total post-opener question count = 6 + 14 = 20. */
const RANDOM_POOL_COUNT = 14;
/** Back-compat alias for callsites that still reference the old name. */
export const STARTER_SEED_COUNT = RETURNING_LITE_COUNT;

/** Observer fires every N post-opener picks. On turns where it doesn't
 *  fire, only detective + interrogator run. Observer's payload then
 *  carries a window of recent picks (defined by OBSERVER_WINDOW) so it
 *  can metabolize multiple turns at once. */
const OBSERVER_INTERVAL = 3;
const OBSERVER_WINDOW = 3;
/** Detective's running scratchpad. Last N entries are surfaced as
 *  `detective_log` on the next call so the detective has continuity. */
const DETECTIVE_LOG_CAP = 8;

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
  private agentInFlight = { observer: 0, detective: 0 };
  private starterSeedFired = false;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    this.state = this.initState(opts);
  }

  // ─── public API ──────────────────────────────────────

  getState(): EngineState {
    return this.state;
  }

  getCurrentQuestion(): RenderedQuestion | null {
    if (this.state.closed) return null;
    const head = this.state.queue[0];
    if (!head) return null;
    this.currentRenderedAt = Date.now();
    return renderQuestion(
      head.node_id,
      this.state.profile,
      head.preamble,
      head.options_override,
    );
  }

  /** True when the user has out-paced the pipeline: queue empty but a
   *  pipeline run is in flight. UI uses this to show a spinner rather
   *  than treating the survey as exhausted. */
  isWaitingForPipeline(): boolean {
    return !this.state.closed && this.state.queue.length === 0 && this.pipelinesInFlight > 0;
  }

  async submitAnswer(answer: string | string[]): Promise<void> {
    if (this.state.closed) return;
    const head = this.state.queue[0];
    if (!head) return;
    const node = getNode(head.node_id);
    if (!node) return;

    const renderedAt = this.currentRenderedAt || Date.now();
    const answeredAt = Date.now();
    const latencyMs = answeredAt - renderedAt;

    // Capture the question + options EXACTLY as the user saw them — so
    // history reflects what was on screen, not what the basket says now.
    const renderedNow = renderQuestion(
      head.node_id,
      this.state.profile,
      head.preamble,
      head.options_override,
    );

    const pick: PickEvent = {
      node_id: head.node_id,
      question_text: renderedNow.text,
      options_shown: renderedNow.options,
      answer,
      answered_at: answeredAt,
      latency_ms: latencyMs,
      prompted_by: head.prompted_by,
    };
    const timing: TimingEvent = {
      node_id: head.node_id,
      rendered_at: renderedAt,
      answered_at: answeredAt,
      latency_ms: latencyMs,
      revisions: 0,
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

    this.setState({
      picks_log: [...this.state.picks_log, pick],
      timing_log: [...this.state.timing_log, timing],
      asked_node_ids: [...this.state.asked_node_ids, head.node_id],
      queue: this.state.queue.slice(1),
    });

    // Populate profile if this was an opener.
    this.applyOpenerDataIfRelevant(head.node_id, answer);

    // Process relationship_pick answers: parse the structured JSON
    // payload and add/update the CastMember on the profile.
    if (node.f === 'relationship_pick' && typeof answer === 'string') {
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
      this.spawnPipeline(pick);

      // Transition to IntentConfirm when there's nothing more to ask.
      // With the queue pre-rolled at fixed size, this fires naturally
      // when the user has consumed every question. No cap watermark
      // needed; queue exhaustion IS the close trigger.
      const postOpenerCount = this.countPostOpenerPicks();
      const queueEmpty = this.state.queue.length === 0;
      if (queueEmpty && postOpenerCount > 0) {
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

  // questionCap removed — queue exhaustion is the close trigger now.

  // ─── End-of-survey stages ────────────────────────────

  /** Sync transition from questions → awaiting_intention. No LLM call.
   *  The user provides their own intention via the IntentConfirm UI;
   *  the engine doesn't guess. */
  private beginIntentionStage(): void {
    if (this.state.stage !== 'questions') return;   // idempotent
    this.setState({ stage: 'awaiting_intention', thinking: false });
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

    this.setState({
      chosen_intention: cleaned,
      stage: 'compiling',         // covers Augur + Seer-construction loading
      thinking: true,
    });
    this.emit();

    // Deterministic identity record from the closed survey state.
    const profile = assembleProfile(this.state, '');
    const drawn = drawForSpread(FOUR_CARD_DIAMOND);

    // Augur runs FIRST (~5-7s, opus×N for outcome fills). When it
    // resolves, we instantiate Seer with the outcomes — Seer's own
    // intro pipeline (~3s) then runs to fill state.intro. UI loading
    // is a single 'compiling' phase covering both.
    void runAugur(this.opts.adapter, {
      profile,
      intention: cleaned,
      surveyHistory: this.state.picks_log,
    })
      .then((outcomes) => {
        this.seer = new Seer({
          adapter: this.opts.adapter,
          profile,
          surveyHistory: this.state.picks_log,
          intention: cleaned,
          drawn,
          outcomes,
          surveySynthesis: this.state.current_understanding,
        });
        return this.seer.ready;
      })
      .then(() => {
        this.setState({
          closed: true,
          close_reason: 'cap',
          stage: 'reading_ready',
          thinking: false,
        });
        this.emit();
      })
      .catch((err) => {
        console.warn('[survey] augur+seer pipeline failed', err);
        this.setState({ thinking: false });
        this.emit();
      });
  }

  /** Exposed to App once stage === 'reading_ready'. App routes to the
   *  Reading screen with this Seer instance. */
  getSeer(): Seer | null {
    return this.seer;
  }

  /** UI confirmed a returning Person (via the RESUME modal). Switch
   *  the engine into returning-mode mid-flight: fold the Person's
   *  profile + history into state, drop any pending opener questions
   *  whose data is already known, and seed the starter pool (deduped). */
  confirmReturningPerson(match: ReturningMatch): void {
    // Seed everything from the matched profile EXCEPT name (already set
    // by the user in Q1, may differ in casing/spelling from storage).
    this.setState({
      profile: {
        ...this.state.profile,
        birthday: match.profile.birthday,
        sun_sign: match.profile.sun_sign,
        life_path: match.profile.life_path,
        birth_card: match.profile.birth_card,
        age_bracket: match.profile.age_bracket,
        birth_time_bracket: match.profile.birth_time_bracket,
        // initial_intention not carried across visits — each visit asks
        // its own question via the intent opener.
      },
      is_returning_user: true,
      prior_answered_node_ids: match.answered_node_ids,
      prior_intentions: match.prior_intentions,
      prior_session_summary: match.display_summary,
    });
    this.clearOpenersFromQueue();
    if (!this.starterSeedFired) this.seedPostOpenerQueue();
    this.emit();
  }

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
      initial_intention: null,
      sections: {
        identity: [], state: [], relational: [],
        self_model: [], decision_context: [], patterns: [],
      },
      cast: [],
      ...(opts.returning?.profile_seed ?? {}),
    };
    const startInvestigation: Investigation = {
      hypotheses: [],
      choice_draft: null,
      contradictions: [],
      hooks: [],
      active_threads: [],
      posture: null,
    };
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
      investigation: startInvestigation,
      is_returning_user: isReturning,
      prior_answered_node_ids: opts.returning?.answered_node_ids ?? [],
      prior_intentions: opts.returning?.prior_intentions ?? [],
      prior_session_summary: opts.returning?.prior_session_summary,
      detective_log: [],
      current_understanding: [],
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
    };
  }

  private isOpenerSatisfiedFor(node_id: string, profile: SurveyProfile): boolean {
    switch (node_id) {
      case 'name':         return profile.name.trim().length > 0;
      case 'birthday':     return profile.birthday !== null;
      case 'birth_time':   return profile.birth_time_bracket !== null;
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
    this.setState({
      profile: { ...this.state.profile, cast: nextCast },
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
      this.setState({ profile: { ...this.state.profile, name: cleaned } });
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
    if (node_id === 'intent') {
      // The IntentForm submits the user's typed question, OR an empty
      // string when they pressed "I DON'T KNOW". Empty → null.
      const trimmed = (typeof answer === 'string' ? answer : answer[0] ?? '').trim();
      this.setState({
        profile: {
          ...this.state.profile,
          initial_intention: trimmed.length > 0 ? trimmed : null,
        },
      });
      return false;
    }
    return false;
  }

  /** Drop any remaining opener nodes from the front of the queue.
   *  Called when we detect a returning user mid-opener-chain. */
  private clearOpenersFromQueue(): void {
    this.setState({
      queue: this.state.queue.filter((q) => !OPENER_NODE_IDS.has(q.node_id)),
    });
  }

  /** Pre-roll the post-opener queue. New users get the 6 Pillars (in
   *  order) followed by 14 random pool draws. Returning users get a
   *  lite-mode 6 random pool draws only (dedup'd against prior history).
   *  Idempotent — only fires once per session. */
  private seedPostOpenerQueue(): void {
    if (this.starterSeedFired) return;
    this.starterSeedFired = true;

    const priorAnswered = new Set(this.state.prior_answered_node_ids);

    if (this.state.is_returning_user) {
      // Lite mode: 6 random pool draws, dedup'd against prior visits.
      const pool = getPoolNodeIds().filter(
        (id) => !this.state.asked_node_ids.includes(id) && !priorAnswered.has(id),
      );
      const shuffled = shuffleInPlace([...pool]).slice(0, 6);
      for (const id of shuffled) {
        this.enqueueDirect(id, null, null);
      }
      return;
    }

    // First-visit flow: Pillars in order + 14 random pool draws.
    for (const id of getPillars()) {
      this.enqueueDirect(id, null, null);
    }
    const pool = getPoolNodeIds().filter(
      (id) => !this.state.asked_node_ids.includes(id),
    );
    const shuffled = shuffleInPlace([...pool]).slice(0, RANDOM_POOL_COUNT);
    for (const id of shuffled) {
      this.enqueueDirect(id, null, null);
    }
  }

  /** Push per-agent + total pipeline counts to the debug bus. */
  private publishInflight(): void {
    publishDebug('survey.inflight', this.pipelinesInFlight);
    publishDebug('survey.agent.observer', this.agentInFlight.observer);
    publishDebug('survey.agent.detective', this.agentInFlight.detective);
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

  private async runPipeline(pick: PickEvent): Promise<void> {
    // Each pipeline takes ONE snapshot at fire-time. All agents read this
    // SAME snapshot in parallel. Cross-agent updates (this pipeline's
    // observer output → detective context, etc.) DO NOT propagate within
    // a single pipeline — they land on the NEXT pipeline's snapshot.
    //
    // The lag is acceptable: each agent's contribution accumulates in
    // engine state and the next pipeline catches up. The win is ~2x
    // wall-clock since we no longer chain observer → detective →
    // interrogator serially.
    //
    // Collision handling lives in the merge functions (apply…). Outputs
    // are designed to be commutative-ish: notes append, hypotheses upsert
    // by id, contradictions/hooks append-with-dedupe, choice_draft
    // replaces. Sibling pipelines stomping the same field → later writer
    // wins (per spec).

    const baseCtx: PipelineContext = {
      index: this.state.picks_log.length,
      question: pick.question_text,
      options_shown: pick.options_shown,
      answer: pick.answer,
      profile: this.state.profile,
      investigation: this.state.investigation,
      history: this.state.picks_log,
      queue: this.state.queue,
    };

    // Observer fires every OBSERVER_INTERVAL post-opener picks. On the
    // turns it fires, payload includes a window of recent picks
    // (OBSERVER_WINDOW) so it metabolizes multiple turns at once. Skipped
    // turns mean detective + interrogator run without an observer firing
    // — observer's next firing will catch up.
    const postOpenerCount = this.countPostOpenerPicks();
    const observerThisTurn = postOpenerCount % OBSERVER_INTERVAL === 1;

    const tasks: Promise<unknown>[] = [];

    if (observerThisTurn) tasks.push(this.runObserverTask(baseCtx));
    // Returning users skip detective entirely — the seeded 6 questions
    // ARE the survey, no need to run hypothesis or queue-editing work.
    // Their profile already exists; observer's profile pass is enough.
    if (!this.state.is_returning_user) {
      tasks.push(this.runDetectiveTask(baseCtx));
    }

    await Promise.allSettled(tasks);
  }

  private async runObserverTask(baseCtx: PipelineContext): Promise<void> {
    this.agentInFlight.observer += 1; this.publishInflight();
    try {
      // Observer payload carries `recent_picks` = last OBSERVER_WINDOW
      // entries of picks_log (snapshot's history). Prompt instructs the
      // model to file notes for any of those turns worth filing.
      const recentPicks = baseCtx.history.slice(-OBSERVER_WINDOW);
      const out: ObserverOutput = await runObserver(this.opts.adapter, {
        ...baseCtx,
        recent_picks: recentPicks,
      });
      this.setState({ profile: applyObserverOutput(this.state.profile, out) });
      this.emit();
    } catch (e) {
      console.warn('[survey] observer failed', e);
    } finally {
      this.agentInFlight.observer -= 1; this.publishInflight();
    }
  }

  private async runDetectiveTask(baseCtx: PipelineContext): Promise<void> {
    this.agentInFlight.detective += 1; this.publishInflight();
    try {
      const out: DetectiveOutput = await runDetective(this.opts.adapter, {
        ...baseCtx,
        detective_log: this.state.detective_log,
        current_understanding: this.state.current_understanding,
      });
      // Hypotheses never auto-prune — the detective's full board persists
      // across the whole survey, per design.
      const nextInvestigation = applyDetectiveOutput(this.state.investigation, out);
      const nextLog = out.private_thoughts && out.private_thoughts.trim().length > 0
        ? [...this.state.detective_log, out.private_thoughts.trim()].slice(-DETECTIVE_LOG_CAP)
        : this.state.detective_log;
      const nextUnderstanding = (out.current_understanding ?? [])
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
        .slice(0, 3);
      // Apply queue_edits to UPCOMING queue items. Each edit references a
      // queue index (0 = next to be asked); only items still ahead of the
      // user get modified. Edits that miss the window are silently dropped.
      const nextQueue = applyQueueEdits(this.state.queue, out.queue_edits ?? []);
      this.setState({
        investigation: nextInvestigation,
        detective_log: nextLog,
        current_understanding: nextUnderstanding,
        queue: nextQueue,
      });
      this.emit();
    } catch (e) {
      console.warn('[survey] detective failed', e);
    } finally {
      this.agentInFlight.detective -= 1; this.publishInflight();
    }
  }

  // Old finalize() was removed — the close path now runs through
  // beginIntentionStage() → submitIntention() → compiler. See those.
}

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

/** Apply detective queue_edits to upcoming queue items. Edits reference
 *  queue indices (0 = next). Edits past the queue length are dropped.
 *  Per edit: optional preamble override, optional options_override for
 *  choice-format nodes. Returns a new queue (never mutates input). */
function applyQueueEdits(
  queue: QueueItem[],
  edits: Array<{ index: number; preamble?: string; options_override?: string[] }>,
): QueueItem[] {
  if (edits.length === 0) return queue;
  const next = queue.slice();
  for (const edit of edits) {
    if (edit.index < 0 || edit.index >= next.length) continue;
    const item = next[edit.index];
    if (!item) continue;
    const node = getNode(item.node_id);
    const preamble = edit.preamble?.trim();
    const optionsOverride =
      node && node.f === 'choice' && edit.options_override && edit.options_override.length > 0
        ? edit.options_override
        : undefined;
    next[edit.index] = {
      ...item,
      preamble: preamble && preamble.length > 0 ? preamble : item.preamble,
      options_override: optionsOverride ?? item.options_override,
    };
  }
  return next;
}

/** Merge observer output into profile — append notes by section,
 *  upsert cast by label. */
function applyObserverOutput(profile: SurveyProfile, out: ObserverOutput): SurveyProfile {
  const now = Date.now();
  const sections = { ...profile.sections };
  for (const n of out.notes_to_append) {
    const note: Note = {
      text: n.text,
      category: n.category,
      source_picks: n.source_picks,
      confidence: n.confidence,
      created_at: now,
    };
    sections[n.section] = [...sections[n.section], note];
  }
  return {
    ...profile,
    sections,
    cast: mergeCast(profile.cast, out.cast_updates),
  };
}

/** Apply detective output to investigation. Designed for safe
 *  composition: sibling pipelines stomping on the same field do NOT
 *  corrupt state — each merge rule is associative-ish.
 *
 *    hypotheses        upsert by id (per-id last-write-wins)
 *    contradictions    union-by-description (no dupes from two pipelines flagging same tension)
 *    hooks             union-by-description (same)
 *    choice_draft      replace ONLY if incoming has confidence >= existing
 *                       (so a slower / less-informed detective can't regress a stronger draft)
 *    active_threads    upsert by thread_id
 *    posture           replace if incoming non-null (last-write-wins)
 */
function applyDetectiveOutput(inv: Investigation, out: DetectiveOutput): Investigation {
  let hypotheses = mergeHypotheses(inv.hypotheses, out.hypothesis_updates);
  if (out.hypothesis_refutes.length > 0) {
    const refuted = new Set(out.hypothesis_refutes);
    hypotheses = hypotheses.map((h) =>
      refuted.has(h.id) ? { ...h, status: 'refuted' as const } : h,
    );
  }
  const threadMap = new Map(inv.active_threads.map((t) => [t.thread_id, t]));
  for (const u of out.thread_updates) {
    const existing = threadMap.get(u.thread_id);
    if (existing) threadMap.set(u.thread_id, { ...existing, status: u.status });
  }
  return {
    ...inv,
    hypotheses,
    choice_draft: pickStrongerChoice(inv.choice_draft, out.choice_update),
    contradictions: unionByKey(inv.contradictions, out.contradictions_found, (c) => c.description.toLowerCase()),
    hooks: unionByKey(inv.hooks, out.hooks_found, (h) => h.description.toLowerCase()),
    active_threads: Array.from(threadMap.values()),
    posture: out.posture ?? inv.posture,
  };
}

const CONFIDENCE_RANK: Record<'low' | 'medium' | 'high', number> = { low: 1, medium: 2, high: 3 };

/** Choice-draft merge: only replace when incoming is at least as
 *  confident as existing. A late-arriving pipeline whose detective is
 *  LESS confident can't regress an already-strong draft. */
function pickStrongerChoice(existing: Investigation['choice_draft'], incoming: Investigation['choice_draft']) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return CONFIDENCE_RANK[incoming.confidence] >= CONFIDENCE_RANK[existing.confidence]
    ? incoming
    : existing;
}

/** Append-with-dedupe. Items with the same key from the existing list
 *  are kept (first-seen wins); only NEW keys from incoming are added. */
function unionByKey<T>(existing: T[], incoming: T[], key: (t: T) => string): T[] {
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const item of incoming) {
    const k = key(item);
    if (!seen.has(k)) {
      out.push(item);
      seen.add(k);
    }
  }
  return out;
}

function mergeCast(existing: CastMember[], updates: CastMember[]): CastMember[] {
  const byLabel = new Map(existing.map((c) => [c.label, c]));
  for (const u of updates) byLabel.set(u.label, u);
  return Array.from(byLabel.values());
}

function mergeHypotheses(existing: Hypothesis[], updates: Hypothesis[]): Hypothesis[] {
  const byId = new Map(existing.map((h) => [h.id, h]));
  for (const u of updates) byId.set(u.id, u);
  return Array.from(byId.values());
}

// Engine-side hypothesis pruning removed. The detective now persists
// its full board across the whole survey — the scratchpad
// (detective_log) carries continuity, and stale hypotheses are
// information (a refuted lead is a useful constraint), not noise.
