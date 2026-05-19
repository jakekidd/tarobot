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
import { runInterrogator } from './agents/interrogator';
import { runShaman } from './agents/shaman';
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
  getPoolNodeIds,
  renderQuestion,
  TREE,
} from './tree';
import { derivePhase } from './phase';
import type {
  BasketItem,
  CastMember,
  EngineListener,
  EngineState,
  Hypothesis,
  Investigation,
  Note,
  ObserverOutput,
  DetectiveOutput,
  InterrogatorOutput,
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
  /** How many post-opener questions the survey runs. Default 20.
   *  After this many answers, no more interrogator runs fire, and the
   *  next user submit triggers the shaman step. */
  question_cap?: number;
};

const OPENER_NODE_IDS = new Set<string>(getOpeners());

export const STARTER_SEED_COUNT = 6;
const DEFAULT_QUESTION_CAP = 20;

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
  private agentInFlight = { observer: 0, detective: 0, interrogator: 0 };
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

    this.setState({
      phase: derivePhase(this.state.phase, this.state.picks_log.length, false),
    });

    // Routing rule:
    //   - mid-opener-chain → walk to next opener; NO pipeline (openers
    //     don't trigger AI work — they're just data intake).
    //   - end of openers → seed the starter pool. NO pipeline yet.
    //   - post-opener answer → spawn the 3-agent pipeline UNLESS we
    //     just hit the question cap (in which case spawn observer +
    //     detective only — the interrogator's job is done since the
    //     queue is fully populated).
    //   - if this answer was the LAST one (cap hit + queue now empty),
    //     transition to shaman_thinking and fire the shaman.
    if (OPENER_NODE_IDS.has(head.node_id)) {
      const enqueued = this.enqueueNextOpener(head.node_id);
      if (!enqueued) {
        this.seedStarterPool();
      }
    } else {
      // Post-opener pipeline. Interrogator suppressed cap−6 turns out so
      // the existing starter-pool seeds (STARTER_SEED_COUNT) carry the
      // final stretch without piling on new questions the user won't
      // reach. Past that watermark we still run Observer + Detective —
      // we just stop appending to the queue.
      const postOpenerCount = this.countPostOpenerPicks();
      const cap = this.questionCap();
      const interrogatorWatermark = cap - STARTER_SEED_COUNT;
      const suppressInterrogator =
        postOpenerCount + this.state.queue.length >= interrogatorWatermark;
      this.spawnPipeline(pick, suppressInterrogator);

      // Transition to shaman when there's nothing more to ask. Two
      // independent triggers, OR'd:
      //   - hard cap reached AND queue empty (normal close);
      //   - queue empty AND no pipelines in flight AND we're past the
      //     starter pool's worth of post-opener picks (stall close —
      //     guards against async timing leaving the queue dry under cap).
      const queueEmpty = this.state.queue.length === 0;
      const capReached = postOpenerCount >= cap;
      const stalled = queueEmpty && this.pipelinesInFlight === 0 && postOpenerCount >= STARTER_SEED_COUNT;
      if (queueEmpty && (capReached || stalled)) {
        this.beginShamanStage();
      }
    }

    this.refreshThinking();
    this.emit();
  }

  /** Number of post-opener questions the user has answered. */
  private countPostOpenerPicks(): number {
    return this.state.picks_log.filter((p) => !OPENER_NODE_IDS.has(p.node_id)).length;
  }

  private questionCap(): number {
    return this.opts.question_cap ?? DEFAULT_QUESTION_CAP;
  }

  // ─── End-of-survey stages ────────────────────────────

  /** Fire the shaman in the background. While it runs, stage =
   *  'shaman_thinking' and UI shows a loading state. On return,
   *  intentions_offered populates + stage flips to awaiting_intention. */
  private beginShamanStage(): void {
    if (this.state.stage !== 'questions') return;   // idempotent
    this.setState({ stage: 'shaman_thinking', thinking: true });
    this.emit();

    void runShaman(this.opts.adapter, {
      profile: this.state.profile,
      investigation: this.state.investigation,
      history: this.state.picks_log,
      prior_intentions: this.state.prior_intentions,
    })
      .then((out) => {
        this.setState({
          intentions_offered: out.intentions,
          stage: 'awaiting_intention',
          thinking: false,
        });
        this.emit();
      })
      .catch((err) => {
        console.warn('[survey] shaman failed; falling back to write-in-only intention picker', err);
        this.setState({
          intentions_offered: [],
          stage: 'awaiting_intention',
          thinking: false,
        });
        this.emit();
      });
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
        has_question_mode: match.profile.has_question_mode,
      },
      is_returning_user: true,
      prior_answered_node_ids: match.answered_node_ids,
      prior_intentions: match.prior_intentions,
      prior_session_summary: match.display_summary,
    });
    this.clearOpenersFromQueue();
    if (!this.starterSeedFired) this.seedStarterPool();
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
    this.beginShamanStage();
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
      has_question_mode: null,
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
      intention_guesses: [],
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
      case 'has_question': return profile.has_question_mode !== null;
      default:             return false;
    }
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
    if (node_id === 'has_question') {
      this.setState({ profile: { ...this.state.profile, has_question_mode: mapHasQuestion(ans) } });
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

  /** Pick STARTER_SEED_COUNT random pool nodes and append them to the
   *  queue. Idempotent — only fires once per session. */
  private seedStarterPool(): void {
    if (this.starterSeedFired) return;
    this.starterSeedFired = true;
    const priorAnswered = new Set(this.state.prior_answered_node_ids);
    const pool = getPoolNodeIds().filter(
      (id) => !this.state.asked_node_ids.includes(id) && !priorAnswered.has(id),
    );
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const picks = shuffled.slice(0, STARTER_SEED_COUNT);
    for (const id of picks) {
      this.enqueueDirect(id, null, null);
    }
  }

  /** Push per-agent + total pipeline counts to the debug bus. */
  private publishInflight(): void {
    publishDebug('survey.inflight', this.pipelinesInFlight);
    publishDebug('survey.agent.observer', this.agentInFlight.observer);
    publishDebug('survey.agent.detective', this.agentInFlight.detective);
    publishDebug('survey.agent.interrogator', this.agentInFlight.interrogator);
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
  // updates after observer, investigation updates after detective,
  // queue grows after interrogator.

  private buildBasket(): BasketItem[] {
    const priorAnswered = new Set(this.state.prior_answered_node_ids);
    return getPoolNodeIds()
      .filter((id) => !this.state.asked_node_ids.includes(id))
      .filter((id) => !this.state.queue.some((q) => q.node_id === id))
      .filter((id) => !priorAnswered.has(id))
      .map((id) => {
        const n = getNode(id)!;
        return {
          id,
          text: n.q,
          format: n.f,
          topic: n.topic,
          default_options: n.a ? n.a.map((t) => t[0]) : [],
        };
      });
  }

  private spawnPipeline(pick: PickEvent, suppressInterrogator = false): void {
    this.pipelinesInFlight += 1;
    this.publishInflight();
    this.refreshThinking();
    void this.runPipeline(pick, suppressInterrogator).finally(() => {
      this.pipelinesInFlight -= 1;
      this.publishInflight();
      this.refreshThinking();
      this.maybeTriggerShamanOnStall();
      this.emit();
    });
  }

  /** When the last pipeline drains and the queue is still empty, we've
   *  stalled below cap. Trigger shaman so the survey can close instead
   *  of leaving the user staring at an empty screen. */
  private maybeTriggerShamanOnStall(): void {
    if (this.state.stage !== 'questions') return;
    if (this.state.queue.length > 0) return;
    if (this.pipelinesInFlight > 0) return;
    const postOpenerCount = this.countPostOpenerPicks();
    if (postOpenerCount < STARTER_SEED_COUNT) return;
    this.beginShamanStage();
  }

  private async runPipeline(pick: PickEvent, suppressInterrogator: boolean): Promise<void> {
    // Each pipeline takes ONE snapshot of engine state at fire-time.
    // The three agents run in serial against that snapshot, evolving
    // a local view as they go (observer's output feeds detective's
    // ctx; detective's feeds interrogator's). Agents NEVER re-read
    // engine state mid-pipeline — sibling pipelines may have written
    // since this one started, and seeing those writes would muddy the
    // pipeline's own reasoning. The cost of that "ignorance" is a
    // little staleness on the prompt input; the benefit is each
    // pipeline produces internally-consistent output without
    // synchronization across pipelines.
    //
    // The collision handling lives in the merge functions (apply…)
    // which write into CURRENT engine state. Outputs are designed to
    // be commutative-ish: notes append, hypotheses upsert by id,
    // contradictions/hooks append-with-dedupe, choice_draft replaces.
    // Two sibling pipelines stomping on the same field = the later
    // writer wins (per spec).

    const snapshot = {
      profile: this.state.profile,
      investigation: this.state.investigation,
      history: this.state.picks_log,
      queue: this.state.queue,
      basket: this.buildBasket(),
    };
    const thisTurn = {
      index: this.state.picks_log.length,
      question: pick.question_text,
      options_shown: pick.options_shown,
      answer: pick.answer,
    };

    // ── STAGE 1: Observer ────────────────────────────
    // Observer sees snapshot. Outputs profile updates.
    this.agentInFlight.observer += 1; this.publishInflight();
    let observerOut: ObserverOutput | null = null;
    try {
      const ctx: PipelineContext = {
        ...thisTurn,
        profile: snapshot.profile,
        investigation: snapshot.investigation,
        history: snapshot.history,
        queue: snapshot.queue,
        basket: snapshot.basket,
      };
      observerOut = await runObserver(this.opts.adapter, ctx);
      this.setState({
        profile: applyObserverOutput(this.state.profile, observerOut),
      });
      this.emit();
    } catch (e) {
      console.warn('[survey] observer failed', e);
    } finally {
      this.agentInFlight.observer -= 1; this.publishInflight();
    }

    // ── STAGE 2: Detective ───────────────────────────
    // Detective sees snapshot + observer's just-produced output. That
    // projection is built from `snapshot.profile`, NOT engine state,
    // so sibling pipelines' writes don't leak into this prompt.
    const profileAfterObserver = observerOut
      ? applyObserverOutput(snapshot.profile, observerOut)
      : snapshot.profile;

    this.agentInFlight.detective += 1; this.publishInflight();
    let detectiveOut: DetectiveOutput | null = null;
    try {
      const ctx: PipelineContext = {
        ...thisTurn,
        profile: profileAfterObserver,
        investigation: snapshot.investigation,
        history: snapshot.history,
        queue: snapshot.queue,
        basket: snapshot.basket,
      };
      detectiveOut = await runDetective(this.opts.adapter, ctx);
      let nextInvestigation = applyDetectiveOutput(this.state.investigation, detectiveOut);
      nextInvestigation = pruneStaleHypotheses(nextInvestigation, this.state.picks_log);
      this.setState({ investigation: nextInvestigation });
      this.emit();
    } catch (e) {
      console.warn('[survey] detective failed', e);
    } finally {
      this.agentInFlight.detective -= 1; this.publishInflight();
    }

    // ── STAGE 3: Interrogator ────────────────────────
    // Interrogator sees snapshot + observer + detective. Same projection
    // pattern — never re-reads engine state.
    const investigationAfterDetective = detectiveOut
      ? pruneStaleHypotheses(
          applyDetectiveOutput(snapshot.investigation, detectiveOut),
          snapshot.history,
        )
      : snapshot.investigation;

    // Skip the interrogator entirely once we've hit the question cap.
    // The queue is fully populated; no more questions need to be added.
    // (Observer + detective still fire — we want their analysis on the
    // last picks even though we won't ask anything more.)
    if (suppressInterrogator) return;

    this.agentInFlight.interrogator += 1; this.publishInflight();
    try {
      const ctx: PipelineContext = {
        ...thisTurn,
        profile: profileAfterObserver,
        investigation: investigationAfterDetective,
        history: snapshot.history,
        queue: snapshot.queue,
        basket: snapshot.basket,
      };
      const out: InterrogatorOutput = await runInterrogator(this.opts.adapter, ctx);
      this.applyInterrogatorOutput(out);
    } catch (e) {
      console.warn('[survey] interrogator failed, falling back to random pool pick', e);
      this.fallbackRandomPick();
    } finally {
      this.agentInFlight.interrogator -= 1; this.publishInflight();
    }
  }

  private applyInterrogatorOutput(out: InterrogatorOutput): void {
    const chosenId = out.next_question.node_id;
    const node = getNode(chosenId);
    const inBasket = node && !this.state.asked_node_ids.includes(chosenId)
      && !this.state.queue.some((q) => q.node_id === chosenId);
    if (!inBasket) {
      this.fallbackRandomPick();
      return;
    }
    const preamble = (out.next_question.preamble ?? '').trim();
    const optionsOverride =
      node.f === 'choice' && out.next_question.options_override && out.next_question.options_override.length > 0
        ? out.next_question.options_override
        : undefined;
    this.enqueueDirect(
      chosenId,
      null,
      preamble.length > 0 ? preamble : null,
      optionsOverride,
    );
  }

  private fallbackRandomPick(): void {
    const basket = this.buildBasket();
    if (basket.length === 0) return;
    const pick = basket[Math.floor(Math.random() * basket.length)]!;
    this.enqueueDirect(pick.id, null, null);
  }

  // Old finalize() was removed — the close path now runs through
  // beginShamanStage() → submitIntention() → compiler. See those.
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

function mapHasQuestion(ans: string): 'specific' | 'general' | 'not_really' | 'not_sure' {
  if (ans.includes('specific')) return 'specific';
  if (ans.includes('general'))  return 'general';
  if (ans.includes('not really')) return 'not_really';
  return 'not_sure';
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
    // Write-only stack: append every detective's intention_guess if
    // present. Duplicates preserved (redundancy is signal).
    intention_guesses: out.intention_guess && out.intention_guess.trim().length > 0
      ? [...inv.intention_guesses, out.intention_guess.trim()]
      : inv.intention_guesses,
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

/** Engine-side pruning of stale low-confidence hypotheses. Runs after
 *  each detective output. The detective herself never sees this — she
 *  has finite working memory and the engine quietly forgets dead leads
 *  for her, exactly like a real detective who stops chasing a suspect
 *  she hasn't gotten a hit on in three rounds.
 *
 *  Rule: hypothesis is auto-refuted if
 *    - status is 'inferred' or 'testing'
 *    - confidence < 0.3
 *    - none of its supporting_picks are in the last 3 user picks
 */
function pruneStaleHypotheses(inv: Investigation, picksLog: PickEvent[]): Investigation {
  const STALE_WINDOW = 3;
  const recent = new Set(picksLog.slice(-STALE_WINDOW).map((p) => p.node_id));
  let changed = false;
  const updated = inv.hypotheses.map((h) => {
    if (h.status !== 'inferred' && h.status !== 'testing') return h;
    if (h.confidence >= 0.3) return h;
    const hasRecentSupport = h.supporting_picks.some((id) => recent.has(id));
    if (hasRecentSupport) return h;
    changed = true;
    return { ...h, status: 'refuted' as const };
  });
  return changed ? { ...inv, hypotheses: updated } : inv;
}
