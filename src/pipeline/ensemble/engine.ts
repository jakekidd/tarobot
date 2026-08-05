// EnsembleEngine — the live loop per docs/SESSION-V2.md.
//
// BEHAVIOR runs on the beat grammar: the engine computes the legal beat
// MENU (structure binds), the driver selects from it, and the render
// path depends on the beat's mode — V speaks authored text with zero
// calls, T fills authored skeletons through a validated fast-tier call,
// F rides the full persona path (reactive tissue only). COGNITION is
// the interpreter+profiler fan, the conjector's hunt→classify→edit
// cycle, and attention regenerating the frame.
//
// Node-portable: no DOM, no timers. The silence clock belongs to the
// caller. Interrupt semantics are generation bumps: a newer event makes
// in-flight results stale, and stale results are discarded, not spoken.

import type { LLMAdapter } from '../llm/adapter';
import { ORACLE_DECK } from '../oracle/deck';
import {
  callAttention,
  callConjector,
  callDriver,
  callInterpreter,
  callPersona,
  callPersonaFill,
  callProfiler,
  DEFAULT_TIERS,
  fmtRead,
  renderDocs,
  renderTail,
  type AgentEnv,
} from './agents';
import {
  assemble,
  BEATS,
  capSentences,
  fillableSlots,
  parseSlots,
  SPREADS,
  validateFills,
  type BeatType,
  type DilemmaClass,
  type QuestionFrame,
  type SlotFills,
  type SpreadClass,
} from './beats';
import { cap, carryFromScroll, fillFromLine, fillFromSilence, spend, talkRatio } from './economy';
import { FrameStore, frameV1 } from './frame';
import { Piles } from './piles';
import { dilemmaCommitted, Profile, renderDilemma, renderFacetList, type DilemmaDoc } from './profile';
import { deriveStage, stageGoals } from './stages';
import {
  countWords,
  ENSEMBLE_CONSTANTS,
  type AgentName,
  type Anchor,
  type Beat,
  type BusyLayer,
  type DrawnCard,
  type EnsembleConstants,
  type EnsembleEvent,
  type EnsembleInput,
  type EnsembleMode,
  type EnsemblePhase,
  type EnsembleSnapshot,
  type EnsembleTelemetry,
  type FrameTrigger,
  type Intent,
  type ScrollEntry,
  type StageId,
} from './types';

type Listener = (snap: EnsembleSnapshot) => void;

const CANNED_LINES = ['mm. go on.', 'say more about that.', 'i am listening.'];

export class EnsembleEngine {
  private readonly adapter: LLMAdapter;
  readonly input: EnsembleInput;
  readonly mode: EnsembleMode;
  private c: EnsembleConstants;
  private readonly env: AgentEnv;

  private phase: EnsemblePhase = 'idle';
  private scroll: ScrollEntry[] = [];
  private readonly piles = new Piles();
  private readonly frames: FrameStore;

  // discovery state — the session starts blind and builds these
  private readonly profile = new Profile();
  private dilemma: DilemmaDoc = {};
  private dilemmaClass: DilemmaClass | null = null;
  private plantId: string | null = null;
  private pendingGuess: string | null = null;
  private guessPlayed = false;
  private conjectorInFlight = false;
  private pendingConjector = false;
  private conjectorSeenBeats = 0;

  // the table — empty until the deal (nothing pre-exists the visitor)
  private drawn: DrawnCard[] = [];
  private spreadClass: SpreadClass | null = null;
  private flipped: number[] = [];

  // arc state
  private questionsAsked = 0;
  private framesUsed = new Map<QuestionFrame, number>();
  private namingDelivered = false;
  private namingReadySince: number | null = null; // oracle-beat count when ready
  private dealReadySince: number | null = null;
  private coherence: 0 | 1 | 2 | 3 = 3;
  private questionsSinceGuess = 0;
  private lastGuessGrade: 'cold' | 'warm' | 'hot' | 'unplayed' | null = null;
  private altGuess: string | null = null;
  private focusPhrase: string | null = null;
  private altFocus: string | null = null;
  /** 0 unoffered · 1 main offered · 2 alt offered · 3 accepted · 4 exploration */
  private focusStage = 0;
  private guessCount = 0;
  private lastOracleBeatType: BeatType | null = null;
  private greetingVariant = 0;
  private flipInviteVariant = 0;
  private closeVariant = 0;

  private budget: number;
  private busy: BusyLayer = null;
  private lastIntent: Intent | null = null;
  private error: string | null = null;
  private cannedIdx = 0;

  private gen = 0;

  // fan state
  private fanInFlight = false;
  private pendingFan: { force: boolean } | null = null;
  private newWordsSinceFan = 0;
  private turnsWithMaterialSinceFan = 0;
  private visitorWordsThisTurn = 0;
  private lastFanScrollIndex = 0;
  private lastEventWasFlip = false;

  // attention state
  private attentionInFlight = false;
  private pendingAttention: FrameTrigger | null = null;
  private turnsSinceFrameRegen = 0;

  /** interpreter thoughts filed since the driver last spent one as ammo */
  private thoughtsSinceAmmo = 0;

  private opLog: { t: number; text: string }[] = [];
  private note(text: string): void {
    this.opLog.push({ t: Date.now(), text });
  }

  private listeners = new Set<Listener>();

  constructor(args: {
    adapter: LLMAdapter;
    input: EnsembleInput;
    constants?: Partial<EnsembleConstants>;
    telemetry?: EnsembleTelemetry;
    tiers?: Partial<Record<AgentName, 'fast' | 'cognition' | 'deep'>>;
  }) {
    this.adapter = args.adapter;
    this.input = args.input;
    this.mode = args.input.mode;
    this.c = { ...ENSEMBLE_CONSTANTS, ...args.constants };
    this.budget = this.c.START_BUDGET;
    this.frames = new FrameStore(frameV1(args.input));
    this.env = {
      adapter: this.adapter,
      telemetry: args.telemetry,
      tiers: { ...DEFAULT_TIERS, ...args.tiers },
    };
  }

  // ------------------------------------------------------------- surface

  snapshot(): EnsembleSnapshot {
    return {
      mode: this.mode,
      phase: this.phase,
      stage: this.stage(),
      scroll: this.scroll.slice(),
      log: this.opLog.slice(),
      piles: this.piles.view(),
      frame: this.frames.current(),
      frames: [...this.frames.history()],
      economy: { budget: this.budget, ratio: this.ratio(), carry: this.carry() },
      drawn: this.drawn.slice(),
      spreadClass: this.spreadClass,
      flipped: this.flipped.slice(),
      profile: this.profile.filled(),
      elevated: this.profile.elevated.slice(),
      dilemma: { ...this.dilemma },
      dilemmaClass: this.dilemmaClass,
      pendingGuess: this.pendingGuess,
      namingDelivered: this.namingDelivered,
      beatsRemaining: this.beatsRemaining(),
      coherence: this.coherence,
      questionsAsked: this.questionsAsked,
      busy: this.busy,
      lastIntent: this.lastIntent,
      fanInFlight: this.fanInFlight,
      attentionInFlight: this.attentionInFlight,
      error: this.error,
      constants: { ...this.c },
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    try {
      fn(this.snapshot());
    } catch {
      /* swallow */
    }
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch {
        /* swallow */
      }
    }
  }

  updateConstants(partial: Partial<EnsembleConstants>): void {
    this.c = { ...this.c, ...partial };
    this.emit();
  }

  // -------------------------------------------------------------- events

  /** boot: at most two authored beats — the greeting, then the rant bid.
   *  zero model calls before the visitor has spoken (check 1). */
  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'live';
    this.scroll.push({ kind: 'ev', ev: 'open', t: Date.now() });
    const g = BEATS.greeting.variants;
    this.note('boot: greeting + rant bid, authored, zero model calls');
    this.commitOracle(g[this.greetingVariant % g.length], 'greeting');
    this.commitOracle(BEATS.rant_bid.primary, 'rant_bid');
    this.emit();
  }

  visitorLine(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.phase !== 'live') return;
    this.budget = fillFromLine(this.budget, trimmed, this.c);
    this.scroll.push({ kind: 'beat', speaker: 'visitor', text: trimmed, t: Date.now() });
    const words = countWords(trimmed);
    this.newWordsSinceFan += words;
    this.visitorWordsThisTurn += words;
    void this.dispatch({ type: 'visitor_line' });
  }

  flip(slot: number): void {
    if (this.phase !== 'live' || this.mode !== 'session') return;
    const drawnCard = this.drawn.find((d) => d.slot === slot);
    if (!drawnCard || this.flipped.includes(slot)) return;
    this.flipped.push(slot);
    this.budget = Math.min(this.budget + this.c.FLIP_FILL, this.c.WORD_MAX);
    this.scroll.push({ kind: 'ev', ev: 'flip', slot, t: Date.now() });
    this.lastEventWasFlip = true;
    this.triggerAttention('flip');
    this.maybeConjector(true);
    void this.dispatch({ type: 'card_flip', slot, flip_number: this.flipped.length });
  }

  /** caller-owned clock. no-op while a beat is in flight so a slow model
   *  never stacks silence events behind itself. */
  silenceTick(): void {
    if (this.phase !== 'live' || this.busy !== null) return;
    this.budget = fillFromSilence(this.budget, this.c);
    this.scroll.push({ kind: 'ev', ev: 'silence', t: Date.now() });
    void this.dispatch({ type: 'silence' });
  }

  /** visitor-side termination (walk-away, harness cap): the landing is
   *  spoken anyway — naming-or-charm compressed, quest, close. a
   *  reading is never left on the table. */
  async flushLanding(): Promise<void> {
    if (this.phase !== 'live') return;
    this.note('FLUSH: visitor-side termination — speaking the landing');
    const myGen = ++this.gen;
    this.busy = 'persona';
    this.emit();
    try {
      if (this.namingConditions() && !this.namingDelivered && !this.conjectorInFlight) {
        this.performNaming();
      }
      await this.performClose(
        {
          beat: 'close',
          accomplish: 'the landing flush',
          approx_words: 0,
          note: 'engine flush; no driver call',
        },
        myGen,
      );
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      // even a failed close closes: the scroll gets the authored close
      if (this.phase === 'live') {
        const v = BEATS.close.variants;
        this.commitOracle(v[this.closeVariant++ % v.length], 'close');
        this.scroll.push({ kind: 'ev', ev: 'close', t: Date.now() });
        this.phase = 'closed';
      }
    } finally {
      if (myGen === this.gen) {
        this.busy = null;
        this.emit();
      }
    }
  }

  /** the UI's interrupt: the typewriter was cut off mid-render. */
  truncateLastOracleBeat(visibleText: string): void {
    for (let i = this.scroll.length - 1; i >= 0; i--) {
      const e = this.scroll[i];
      if (e.kind === 'beat' && e.speaker === 'oracle') {
        e.text = visibleText;
        e.truncated = true;
        break;
      }
    }
    this.emit();
  }

  // ------------------------------------------------------------ the menu

  /** the legal beats for this moment — structure binds, the driver
   *  selects. a mandate collapses the menu to one entry. */
  private menu(event: EnsembleEvent): BeatType[] {
    const stage = this.stage();
    const anchorMode = this.coherence <= 1;

    // a flip always earns its read first — mandated
    if (event.type === 'card_flip') return ['read'];

    // ---- the landing ramp (the clock): a session that doesn't land
    // didn't happen. T-4 narrows to the landing beats; T-2 mandates
    // the close (which hands over quest-or-charm). the charm is the
    // floor — never an invented fork.
    const T = this.beatsRemaining();
    if (T <= 2) {
      this.note(`landing ramp T-${T}: close mandated`);
      return ['close'];
    }
    if (T <= 4) {
      if (this.namingConditions() && !this.namingDelivered) {
        if (this.conjectorInFlight) {
          this.note(`landing ramp T-${T}: naming due, waiting out conjector edit`);
          return ['tissue', 'honor', 'hold'];
        }
        this.note(`landing ramp T-${T}: naming mandated`);
        return ['naming'];
      }
      this.note(`landing ramp T-${T}: descending — close available, no new territory`);
      return ['close', 'tissue', 'honor', 'hold'];
    }

    // the naming, once ready, is mandated within NAMING_GRACE_BEATS;
    // grace expiry CONVERTS to mandate (waits out an in-flight edit)
    if (this.namingConditions() && this.graceSpent(this.namingReadySince)) {
      if (this.conjectorInFlight) {
        this.note('naming mandate: waiting out in-flight conjector edit');
        return ['tissue', 'honor', 'hold'];
      }
      return ['naming'];
    }

    let beats: BeatType[];
    if (this.mode === 'chat') {
      beats = this.chatMenu(stage);
    } else {
      beats = this.sessionMenu(stage, event);
    }

    if (anchorMode) {
      // the light show, not the surgery (§8)
      beats = beats.filter((b) => b !== 'naming' && b !== 'guess' && b !== 'quest');
    }
    if (this.namingReady()) beats = [...new Set<BeatType>(['naming', ...beats])];

    // law 3: no two consecutive oracle beats of the same type (tissue exempt)
    if (this.lastOracleBeatType && this.lastOracleBeatType !== 'tissue') {
      beats = beats.filter((b) => b !== this.lastOracleBeatType || b === 'read');
    }
    // law 4: questions never stack — also enforced by law 3, but questions
    // additionally require a beat of tissue after the ANSWER lands is left
    // to the driver; the hard rule is no back-to-back question beats.
    return beats.length > 0 ? beats : ['tissue'];
  }

  private sessionMenu(stage: StageId, event: EnsembleEvent): BeatType[] {
    switch (stage) {
      case 'intro': {
        const beats: BeatType[] = ['tissue', 'honor', 'hold'];
        const guessReady = this.pendingGuess !== null && !this.guessPlayed;
        const coldGate = this.lastGuessGrade === 'cold' && this.questionsSinceGuess < 1;
        if (guessReady && !coldGate) beats.unshift('guess');
        // the interview cadence: three questions buy a mandated guess;
        // warm skips the queue (guess again now)
        if (guessReady && !coldGate && (this.questionsSinceGuess >= 3 || this.lastGuessGrade === 'warm')) {
          this.note(`guess cadence: mandated (${this.questionsSinceGuess} questions since last, grade ${this.lastGuessGrade ?? 'none'})`);
          return ['guess'];
        }
        if (this.questionsAsked < this.c.QUESTION_BUDGET) beats.unshift('question');
        // the consent gate: once the conjector lands a focus, offer it;
        // after an offer the driver reads the room — deal = accepted,
        // focus again = declined (alt, then exploration)
        if (this.focusPhrase && this.focusStage === 0) return ['focus'];
        if (this.focusStage === 1 || this.focusStage === 2) {
          beats.unshift('deal');
          beats.unshift('focus');
        }
        // the rant path: fallback after a refusal, escape ends intake
        beats.push('rant_bid');
        // the deal opens once there is anything to deal on
        if (this.visitorSpoke() && (this.focusStage === 0 ? !this.focusPhrase : this.focusStage >= 1)) beats.push('deal');
        // deal mandate: class landed or budget spent
        if (this.dealReady() && this.graceSpent(this.dealReadySince)) return ['deal'];
        return beats;
      }
      case 'deal': {
        // cards on the table, none flipped
        const beats: BeatType[] = ['tissue', 'hold', 'honor'];
        if (event.type === 'silence') beats.unshift('flip_invite');
        return beats;
      }
      case 'reading':
      case 'naming': {
        const beats: BeatType[] = ['tissue', 'honor', 'hold'];
        if (this.pendingGuess && !this.guessPlayed) beats.unshift('guess');
        if (this.questionsAsked < this.c.QUESTION_BUDGET + 2) beats.push('question');
        if (event.type === 'silence' && this.flipped.length < this.drawn.length) {
          beats.unshift('flip_invite');
        }
        // the ending opens once the midpoint is spoken or the table is
        // fully read — the driver judges when landing has happened
        if (this.namingDelivered || this.flipped.length >= this.drawn.length) {
          beats.push('close');
        }
        return beats;
      }
      case 'closing': {
        return ['close', 'honor', 'tissue', 'hold'];
      }
      default:
        return ['tissue', 'hold'];
    }
  }

  private chatMenu(stage: StageId): BeatType[] {
    if (stage === 'intro') return ['question', 'tissue', 'honor', 'hold', 'rant_bid'];
    if (stage === 'closing') return ['close', 'honor', 'tissue', 'hold'];
    const beats: BeatType[] = ['question', 'tissue', 'honor', 'hold'];
    if (this.pendingGuess && !this.guessPlayed) beats.unshift('guess');
    return beats;
  }

  /** the conditions, independent of edit-in-flight (readiness marking
   *  and the mandate track these; SPEAKING additionally waits out an
   *  in-flight conjector edit so passages stay fresh) */
  private namingConditions(): boolean {
    if (this.spreadClass === 'EXPLORATION') return false;
    if (this.namingDelivered || !dilemmaCommitted(this.dilemma)) return false;
    if (this.coherence < this.c.COHERENCE_GATE) return false;
    if (this.mode === 'chat') return this.anchor().turn >= 4;
    return this.flipped.length >= 2;
  }

  private namingReady(): boolean {
    return this.namingConditions() && !this.conjectorInFlight;
  }

  private dealReady(): boolean {
    if (this.mode !== 'session' || this.drawn.length > 0) return false;
    if (!this.visitorSpoke()) return false;
    // the consent gate: a found focus must be offered and answered first
    if (this.focusPhrase && this.focusStage < 3) return false;
    return this.dilemmaClass !== null || this.questionsAsked >= this.c.QUESTION_BUDGET;
  }

  /** grace: readiness is noted on first sight; the mandate lands after
   *  NAMING_GRACE_BEATS further oracle beats. */
  private graceSpent(since: number | null): boolean {
    if (since === null) return false;
    return this.oracleBeatCount() - since >= this.c.NAMING_GRACE_BEATS;
  }

  private trackReadiness(): void {
    if (this.namingConditions() && this.namingReadySince === null) {
      this.namingReadySince = this.oracleBeatCount();
      this.note(
        `naming READY (committed + ${this.flipped.length} flips + coherence ${this.coherence}) — grace ${this.c.NAMING_GRACE_BEATS} beats`,
      );
    }
    if (!this.namingConditions()) this.namingReadySince = this.namingDelivered ? null : this.namingReadySince;
    if (this.dealReady() && this.dealReadySince === null) {
      this.dealReadySince = this.oracleBeatCount();
    }
  }

  // ------------------------------------------------------------ behavior

  private async dispatch(event: EnsembleEvent): Promise<void> {
    const myGen = ++this.gen;
    this.error = null;

    if (this.c.FAN_BLOCKING && event.type === 'visitor_line') {
      await this.runFan();
      if (myGen !== this.gen) return;
    }

    this.trackReadiness();
    const menu = this.menu(event);
    this.note(
      `menu [${menu.join(' · ')}]${menu.length === 1 ? ' — MANDATED' : ''} ← ${event.type}, stage ${this.stage()}, coherence ${this.coherence}`,
    );

    // TODO(jake): the Intent Engine — a rigid offstage agent that owns
    // "what happens next" wholesale. today intent emerges algorithmically
    // piece by piece instead: menus, mandates, cadence counters, the
    // license ladder — and the short-circuit below. keep shrinking the
    // driver's degrees of freedom as evidence accumulates; add the
    // dedicated agent only if judgment calls remain that rules can't hold.
    if (menu.length === 1 && ['naming', 'focus', 'guess', 'deal'].includes(menu[0])) {
      this.note(`intent emerged algorithmically: ${menu[0]} (mandate short-circuit — driver skipped)`);
      const intent: Intent = {
        beat: menu[0],
        accomplish: `mandated ${menu[0]}`,
        approx_words: 0,
        note: 'engine mandate; no driver call',
      };
      this.lastIntent = intent;
      this.piles.intents.append('driver', this.anchor(), intent);
      try {
        await this.renderBeat(intent, event, myGen);
        if (myGen === this.gen) this.maybeFan();
      } catch (e) {
        if (myGen === this.gen) this.error = e instanceof Error ? e.message : String(e);
      } finally {
        if (myGen === this.gen) {
          this.busy = null;
          this.lastEventWasFlip = false;
          this.emit();
        }
      }
      return;
    }

    this.busy = 'driver';
    this.emit();
    try {
      let intent = await this.driverWithFallback(event, menu);
      if (myGen !== this.gen) return;

      // structure binds: an off-menu selection clamps to the mandate
      if (!menu.includes(intent.beat)) {
        this.note(`CLAMP: driver picked ${intent.beat} off-menu → ${menu[0]}`);
        intent = { ...intent, beat: menu[0], note: `${intent.note} [clamped to menu]` };
      }
      // read beats carry their position job (check 8)
      if (intent.beat === 'read') {
        const slot = event.type === 'card_flip' ? event.slot : this.flipped[this.flipped.length - 1];
        const pos = this.drawn.find((d) => d.slot === slot)?.position;
        if (pos) intent = { ...intent, position: pos };
      }

      this.lastIntent = intent;
      this.piles.intents.append('driver', this.anchor(), intent);
      if (intent.ammo) this.thoughtsSinceAmmo = 0;

      if (intent.beat === 'hold') {
        this.busy = null;
        this.maybeFan();
        this.emit();
        return;
      }

      await this.renderBeat(intent, event, myGen);
      if (myGen !== this.gen) return;

      this.maybeFan();
      if (this.turnsSinceFrameRegen >= this.c.FRAME_BACKSTOP_TURNS) {
        this.triggerAttention('backstop');
      }
    } catch (e) {
      if (myGen === this.gen) {
        this.error = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (myGen === this.gen) {
        this.busy = null;
        this.lastEventWasFlip = false;
        this.emit();
      }
    }
  }

  // ------------------------------------------------------------ rendering

  private async renderBeat(intent: Intent, event: EnsembleEvent, myGen: number): Promise<void> {
    switch (intent.beat) {
      case 'greeting':
      case 'hold':
        return;

      case 'rant_bid': {
        const variant = intent.variant ?? 'fallback';
        this.commitOracle(BEATS.rant_bid[variant], 'rant_bid');
        if (variant === 'escape') {
          // cards first, talk after — straight to an UNKNOWN deal
          await this.performDeal('UNKNOWN', intent, myGen);
        }
        return;
      }

      case 'flip_invite': {
        const v = BEATS.flip_invite.variants;
        this.commitOracle(v[this.flipInviteVariant++ % v.length], 'flip_invite');
        return;
      }

      case 'close': {
        await this.performClose(intent, myGen);
        return;
      }

      case 'focus': {
        if (this.focusStage === 0 && this.focusPhrase) {
          const text = await this.promptedLine(
            `ask them, plainly and in your own words, whether "${this.focusPhrase}" is the real thing to look at tonight. it must be a genuine yes-or-no question they can refuse. one sentence.`,
            (line) => this.focusLineValid(line, this.focusPhrase!),
            BEATS.focus.offer.replace('{PASSAGE:focus}', this.focusPhrase),
            myGen,
          );
          if (myGen !== this.gen) return;
          this.commitOracle(text, 'focus');
          this.focusStage = 1;
          this.note(`focus offered: "${this.focusPhrase}"`);
        } else if (this.focusStage === 1 && this.altFocus) {
          const text = await this.promptedLine(
            `they said no. offer the other thing you saw — "${this.altFocus}" — as a yes-or-no question, taking the miss in stride. one short sentence.`,
            (line) => this.focusLineValid(line, this.altFocus!),
            BEATS.focus.alt.replace('{PASSAGE:focus}', this.altFocus),
            myGen,
          );
          if (myGen !== this.gen) return;
          this.commitOracle(text, 'focus');
          this.focusPhrase = this.altFocus;
          this.altFocus = null;
          this.focusStage = 2;
          this.note('alternate focus offered');
        } else {
          // every focus declined — exploration tarot: no dilemma lens
          this.focusStage = 4;
          this.dilemmaClass = null;
          this.note('all focuses declined → EXPLORATION (mind-heart-root)');
          await this.performDeal('EXPLORATION', intent, myGen);
        }
        return;
      }

      case 'deal': {
        if (this.focusStage === 1 || this.focusStage === 2) {
          this.focusStage = 3;
          this.note('focus accepted by the visitor');
        }
        await this.performDeal(
          this.focusStage === 4 ? 'EXPLORATION' : (this.dilemmaClass ?? 'UNKNOWN'),
          intent,
          myGen,
        );
        return;
      }

      case 'naming': {
        this.performNaming();
        return;
      }

      case 'guess': {
        if (this.pendingGuess) {
          const text = assemble(BEATS.guess.text, {}, { guess: this.pendingGuess });
          this.commitOracle(text, 'guess');
          this.guessPlayed = true;
          this.questionsSinceGuess = 0;
        }
        return;
      }

      case 'question': {
        await this.performQuestion(intent, myGen);
        return;
      }

      case 'quest':
      case 'charm': {
        // reachable only via performClose; a stray selection degrades
        this.commitOracle(this.charmText() ?? BEATS.charm.fallback ?? '', 'charm');
        return;
      }

      case 'tissue':
      case 'read':
      case 'honor': {
        this.busy = 'persona';
        this.emit();
        const line = await this.personaWithFallback(intent, event);
        if (myGen !== this.gen) return;
        const clean = sanitizeLine(line);
        if (clean) this.commitOracle(clean, intent.beat);
        return;
      }
    }
  }

  /** a beat prompt with a postcondition: the persona speaks the beat in
   *  her own words; the machine verifies the FUNCTION; the authored
   *  library line is only the fallback. the guarantee lives in the
   *  validator, not in fixed text (jake, 2026-08-05). */
  private async promptedLine(
    beatPrompt: string,
    valid: (line: string) => boolean,
    fallback: string,
    myGen: number,
  ): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await callPersona(this.env, {
          conversation: this.renderBeats(Infinity),
          frame: this.frames.current().md,
          assignment: `beat prompt: ${beatPrompt}\nfamiliarity: level ${this.familiarity().level}/4 — ${this.familiarity().text}`,
        });
        if (myGen !== this.gen) return fallback;
        const line = out.spoken.trim();
        if (line && valid(line)) return line;
        this.note(`beat-prompt line failed its postcondition (attempt ${attempt + 1})`);
      } catch {
        /* retry, then fallback */
      }
    }
    this.note('beat prompt fell back to the authored line');
    return fallback;
  }

  /** the consent gate's postcondition: carries the focus content and is
   *  a genuine askable question */
  private focusLineValid(line: string, focus: string): boolean {
    if (!line.includes('?') || countWords(line) > 26) return false;
    const fw = focus.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
    if (fw.length === 0) return true;
    const hits = fw.filter((w) => line.toLowerCase().includes(w)).length;
    return hits / fw.length >= 0.5;
  }

  /** T-mode: fill → validate → refill once → fallback (SESSION-V2 §3) */
  private async fillSkeleton(
    skeleton: string,
    fallback: string | undefined,
    materials: string,
    beatType: BeatType,
  ): Promise<{ text: string; fills: { key: string; text: string }[] } | null> {
    const slots = parseSlots(skeleton);
    const fillable = fillableSlots(slots);
    const engineSubs = {
      guess: this.pendingGuess ?? undefined,
      passages: {
        problem: this.dilemma.problem_md ?? '',
        options: this.dilemma.options_md ?? '',
        quest: capSentences(this.dilemma.quest_md ?? '', 2),
      },
    };
    if (fillable.length === 0) {
      return { text: assemble(skeleton, {}, engineSubs), fills: [] };
    }
    const visitorText = this.visitorText();
    const slotDesc = fillable
      .map((s) => `- ${s.key}: ${s.type}${s.arg ? ` (max ${s.arg} words)` : ''}${s.type === 'QUOTE' ? ' — their words VERBATIM, copied exactly' : ''}`)
      .join('\n');
    let fills: SlotFills | null = null;
    for (let attempt = 0; attempt < 2 && !fills; attempt++) {
      try {
        const got = await callPersonaFill(this.env, {
          conversation: this.renderBeats(this.c.BEATS_WINDOW_DRIVER),
          frame: this.frames.current().md,
          skeleton,
          slots: slotDesc,
          materials,
        });
        const failures = validateFills(slots, got, visitorText);
        if (failures.length === 0) fills = got;
      } catch {
        /* refill or fall through */
      }
    }
    if (fills) {
      return {
        text: assemble(skeleton, fills, engineSubs),
        fills: fillable.map((s) => ({ key: s.key, text: fills![s.key] ?? '' })),
      };
    }
    if (fallback !== undefined) {
      this.note(`fill validation failed twice on ${beatType} — fell back to the slotless variant`);
      return { text: assemble(fallback, {}, engineSubs), fills: [] };
    }
    // no fallback authored: the beat degrades to nothing; caller decides
    void beatType;
    return null;
  }

  private async performQuestion(intent: Intent, myGen: number): Promise<void> {
    // a frame wears out: the second verbatim use reads as a machine.
    // an over-used pick swaps to the least-used frame instead.
    let frame: QuestionFrame = intent.frame ?? 'THREAD';
    if ((this.framesUsed.get(frame) ?? 0) >= 1) {
      const fresh = (Object.keys(BEATS.question_frames) as QuestionFrame[]).sort(
        (a, b) => (this.framesUsed.get(a) ?? 0) - (this.framesUsed.get(b) ?? 0),
      )[0];
      this.note(`frame ${frame} worn out → swapped to ${fresh}`);
      frame = fresh;
    }
    this.framesUsed.set(frame, (this.framesUsed.get(frame) ?? 0) + 1);
    const entry = BEATS.question_frames[frame];
    const materials = [
      intent.target ? `aim: ${intent.target}` : '',
      `accomplish: ${intent.accomplish}`,
      this.profile.elevated.length > 0
        ? `elevated facets:\n${this.profile.elevated.map((e) => `- ${e.facet}: ${e.angle}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    const result = await this.fillSkeleton(entry.text, entry.fallback, materials, 'question');
    if (myGen !== this.gen) return;
    if (result) {
      this.commitOracle(result.text, 'question', result.fills);
      this.questionsAsked += 1;
      this.questionsSinceGuess += 1;
    }
  }

  private async performDeal(cls: SpreadClass, intent: Intent, myGen: number): Promise<void> {
    if (this.drawn.length > 0) return;
    const spread = SPREADS[cls];
    this.spreadClass = cls;
    // the draw happens HERE — nothing on the table pre-exists the visitor
    const deck = [...ORACLE_DECK].sort(() => Math.random() - 0.5);
    const cards = deck.slice(0, spread.positions.length);
    // the DIVINER's cheat: the conjector may have named a plant
    if (this.plantId) {
      const plant = ORACLE_DECK.find((c) => c.id === this.plantId);
      if (plant && !cards.some((c) => c.id === plant.id)) {
        cards[Math.min(1, cards.length - 1)] = plant;
      }
    }
    this.drawn = cards.map((card, i) => ({
      slot: i + 1,
      card,
      position: spread.positions[i].job,
    }));
    this.note(
      `DEAL: ${cls} → ${spread.name}, drew [${cards.map((c) => c.id).join(', ')}]${this.plantId ? ` (plant: ${this.plantId})` : ''}`,
    );
    this.scroll.push({ kind: 'ev', ev: 'deal', t: Date.now() });

    const entry = BEATS.deal[cls];
    const materials = [
      `spread: ${spread.name} — positions: ${spread.positions.map((p) => p.job).join(' / ')}`,
      `dilemma so far:\n${renderDilemma(this.dilemma)}`,
      `accomplish: ${intent.accomplish}`,
    ].join('\n\n');
    const result = await this.fillSkeleton(entry.text, entry.fallback, materials, 'deal');
    if (myGen !== this.gen) return;
    if (result) this.commitOracle(result.text, 'deal', result.fills);
    this.triggerAttention('deal');
  }

  /** the naming — the mandated ritual midpoint (SESSION-V2 §5). one
   *  scroll beat: incantation, problem, options, release. */
  private performNaming(): void {
    if (!this.dilemmaClass || !dilemmaCommitted(this.dilemma)) return;
    const text = [
      BEATS.naming.incantations[this.dilemmaClass],
      this.dilemma.problem_md?.trim() ?? '',
      this.dilemma.options_md?.trim() ?? '',
      BEATS.naming.release,
    ]
      .filter(Boolean)
      .join('\n\n');
    this.note('NAMING delivered — reads now APPLY; quest passage unlocked');
    this.commitOracle(text, 'naming');
    this.namingDelivered = true;
    this.namingReadySince = null;
    this.maybeConjector(true); // unlock the quest passage
  }

  private charmText(): string | null {
    return null; // charm renders through fillSkeleton in performClose
  }

  private async performClose(intent: Intent, myGen: number): Promise<void> {
    const questReady =
      this.dilemma.quest_md && this.namingDelivered && this.coherence >= this.c.COHERENCE_GATE;
    if (questReady) {
      const quest = capSentences(this.dilemma.quest_md!, 2);
      this.commitOracle(`${BEATS.quest.lead} ${quest}`, 'quest');
    } else {
      const observed = [
        `profile:\n${this.profile.render()}`,
        `reads:\n${renderTail(this.piles.reads.tail(2), fmtRead)}`,
      ].join('\n');
      const text = await this.promptedLine(
        `no dilemma got named tonight and that is fine — they came in light. hand them ONE small true thing you actually noticed about them as a parting gift. no advice, no fortune, nothing invented. two sentences at most.\nwhat you noticed:\n${observed}`,
        (line) => countWords(line) <= 45 && !/you (should|will|need to)/i.test(line),
        BEATS.charm.fallback ?? BEATS.charm.text,
        myGen,
      );
      if (myGen !== this.gen) return;
      this.commitOracle(text, 'charm');
    }
    const v = BEATS.close.variants;
    this.commitOracle(v[this.closeVariant++ % v.length], 'close');
    this.scroll.push({ kind: 'ev', ev: 'close', t: Date.now() });
    this.phase = 'closed';
    void intent;
  }

  private commitOracle(
    text: string,
    beatType: BeatType,
    fills?: { key: string; text: string }[],
  ): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.scroll.push({
      kind: 'beat',
      speaker: 'oracle',
      text: trimmed,
      t: Date.now(),
      beatType,
      ...(fills && fills.length > 0 ? { fills } : {}),
    });
    this.budget = spend(this.budget, trimmed);
    this.lastOracleBeatType = beatType;
    if (this.visitorWordsThisTurn > 0) this.turnsWithMaterialSinceFan += 1;
    this.visitorWordsThisTurn = 0;
    this.turnsSinceFrameRegen += 1;
  }

  private async driverWithFallback(event: EnsembleEvent, menu: BeatType[]): Promise<Intent> {
    const payload = this.driverPayload(event, menu);
    try {
      return await callDriver(this.env, payload);
    } catch {
      try {
        return await callDriver(this.env, payload);
      } catch {
        return {
          beat: menu.includes('tissue') ? 'tissue' : menu[0],
          accomplish: 'keep the room warm; one small line',
          approx_words: 8,
          note: 'canned: driver failed twice',
          canned: true,
        };
      }
    }
  }

  private async personaWithFallback(intent: Intent, event: EnsembleEvent): Promise<string> {
    const payload = {
      conversation: this.renderBeats(Infinity),
      frame: this.frames.current().md,
      assignment: this.assignment(intent, event),
    };
    // the goldilocks pass: three takes come back, only `spoken` is
    // performed — the drafts stay in the call record for the lab
    try {
      return (await callPersona(this.env, payload)).spoken;
    } catch {
      try {
        return (await callPersona(this.env, payload)).spoken;
      } catch {
        const line = CANNED_LINES[this.cannedIdx % CANNED_LINES.length];
        this.cannedIdx += 1;
        this.lastIntent = this.lastIntent ? { ...this.lastIntent, canned: true } : null;
        return line;
      }
    }
  }

  // ----------------------------------------------------------- cognition

  private maybeFan(force = false): void {
    if (this.fanInFlight) {
      this.pendingFan = { force: force || (this.pendingFan?.force ?? false) };
      return;
    }
    const due =
      force ||
      this.newWordsSinceFan >= this.c.FAN_MIN_NEW_WORDS ||
      this.lastEventWasFlip ||
      this.turnsWithMaterialSinceFan >= this.c.FAN_BACKSTOP_TURNS;
    if (!due) return;
    if (this.newWordsSinceFan === 0 && !this.lastEventWasFlip && !force) return;
    void this.runFan();
  }

  private async runFan(): Promise<void> {
    if (this.fanInFlight) {
      this.pendingFan = { force: this.pendingFan?.force ?? false };
      return;
    }
    this.fanInFlight = true;
    this.emit();

    const anchor = this.anchor();
    const conversation = this.renderFanDelta();
    const frameMd = this.frames.current().md;

    const [read, filing] = await Promise.allSettled([
      callInterpreter(this.env, {
        conversation,
        frame: frameMd,
        ownTail: renderTail(this.piles.reads.tail(this.c.TAIL_READS), fmtRead),
      }),
      callProfiler(this.env, {
        conversation,
        facetList: renderFacetList(),
        profile: this.profile.render(),
      }),
    ]);

    let frameStale = false;
    if (read.status === 'fulfilled') {
      this.piles.reads.append('interpreter', anchor, read.value);
      this.thoughtsSinceAmmo += read.value.thoughts.length;
      this.coherence = read.value.coherence;
      if (read.value.frame_stale) frameStale = true;
    }
    if (filing.status === 'fulfilled') {
      this.profile.merge(filing.value.updates);
      if (filing.value.elevate.length > 0) this.profile.elevated = filing.value.elevate;
    }

    this.maybeConjector();
    this.newWordsSinceFan = 0;
    this.turnsWithMaterialSinceFan = 0;
    this.lastFanScrollIndex = this.scroll.length;
    this.fanInFlight = false;

    if (frameStale) this.triggerAttention('stale');

    this.emit();
    if (this.pendingFan) {
      const { force } = this.pendingFan;
      this.pendingFan = null;
      this.maybeFan(force);
    }
  }

  /** the conjector: hunt → classify → edit (SESSION-V2 §5). wakes on the
   *  rant — the first substantive visitor turn — not on a turn count. */
  private maybeConjector(force = false): void {
    if (this.phase !== 'live') return;
    const awake = this.scroll.some(
      (e) => e.kind === 'beat' && e.speaker === 'visitor' && countWords(e.text) >= this.c.CONJECTOR_WAKE_WORDS,
    ) || this.anchor().turn >= 3;
    if (!awake) return;
    const beats = this.scroll.filter((e) => e.kind === 'beat').length;
    if (!force && beats <= this.conjectorSeenBeats) return;
    if (this.conjectorInFlight) {
      this.pendingConjector = true;
      return;
    }
    void this.runConjector();
  }

  private async runConjector(): Promise<void> {
    this.conjectorInFlight = true;
    this.emit();
    const committed = dilemmaCommitted(this.dilemma);
    const questWanted = committed && (this.namingDelivered || this.flipped.length >= Math.max(2, this.drawn.length - 1));
    const ask = committed
      ? `document mode. re-read the passages against the newest material and rewrite the ONE that most needs it${questWanted ? ' — the quest passage is unlocked; draft or sharpen it (2 sentences maximum, a small observable experiment)' : ''}. include ONLY what you rewrite; re-emitting an unchanged passage is a wasted cycle.`
      : `hunting mode (${this.guessCount} guesses so far; at 5, stop hunting — commit your best read or leave it unnamed). grade your previous guess off the reaction; two warms in one territory = commit. then file the next guess — or CLASSIFY: emit class (FORK|THRESHOLD|LOOP|WEIGHT) + problem_md + options_md + focus (the dilemma in ≤8 plain words, for her consent question) + optionally alt_focus (a second territory) and plant (one deck card id).`;
    this.conjectorSeenBeats = this.scroll.filter((e) => e.kind === 'beat').length;
    try {
      const out = await callConjector(this.env, {
        profile: this.profile.render(),
        table:
          this.drawn.length === 0
            ? '(no cards dealt yet)'
            : this.drawn
                .map(
                  (d) =>
                    `slot ${d.slot} "${d.position}": ${d.card.name} — ${d.card.charge}${this.flipped.includes(d.slot) ? ' [FLIPPED]' : ' [face down — plan with it, never speak it]'}`,
                )
                .join('\n'),
        conversation: this.renderBeats(this.c.BEATS_WINDOW_ATTN),
        prevGuess: this.pendingGuess
          ? `"${this.pendingGuess}" ${this.guessPlayed ? '(played to the visitor)' : '(NOT yet played — grade unplayed unless the room answered it anyway)'}`
          : '(none yet)',
        dilemma: renderDilemma(this.dilemma),
        ask,
      });
      if (out.prev) {
        this.note(`conjector graded previous guess: ${out.prev}`);
        this.lastGuessGrade = out.prev;
      }
      if (out.guess) {
        this.pendingGuess = out.guess;
        this.guessPlayed = false;
        this.altGuess = null;
        if (out.alt_guess) {
          // second guess plays only if it aims at a DIFFERENT target
          try {
            const verdict = await this.adapter.invokeFreeform({
              system:
                'two probing guesses about the same person. do they aim at DIFFERENT targets (different territory of their life or psyche), or is the second a reword of the first? answer exactly "different" or "reword".',
              user: `guess 1: ${out.guess}
guess 2: ${out.alt_guess}`,
              model: 'fast',
              max_tokens: 5,
              label: 'ensemble_divergence',
            });
            if (verdict.trim().toLowerCase().startsWith('different')) {
              this.altGuess = out.alt_guess;
              this.note('alt guess accepted (divergence: different target)');
            } else this.note('alt guess dropped (reword of the first)');
          } catch {
            /* divergence check failed: drop the alt */
          }
        }
      } else if (this.guessPlayed && this.altGuess && this.lastGuessGrade === 'warm') {
        this.pendingGuess = this.altGuess;
        this.altGuess = null;
        this.guessPlayed = false;
        this.note('promoting the alt guess (warm on the first)');
      }
      if (out.class) {
        this.note(`conjector CLASSIFIED: ${out.class}${out.plant ? ` (plant request: ${out.plant})` : ''}`);
        this.dilemmaClass = out.class;
      }
      if (out.focus) this.focusPhrase = out.focus;
      if (out.alt_focus) this.altFocus = out.alt_focus;
      if (out.guess) this.guessCount += 1;
      if (out.plant) this.plantId = out.plant;
      if (out.problem_md) this.dilemma.problem_md = out.problem_md;
      if (out.options_md) this.dilemma.options_md = out.options_md;
      if (out.quest_md) this.dilemma.quest_md = out.quest_md;
      if (out.problem_md || out.options_md) {
        this.pendingGuess = null;
        this.guessPlayed = false;
      }
    } catch {
      /* conjector throws: the hunt lags a cycle, session continues */
    }
    this.conjectorInFlight = false;
    this.emit();
    if (this.pendingConjector) {
      this.pendingConjector = false;
      this.maybeConjector(true);
    }
  }

  private triggerAttention(trigger: FrameTrigger): void {
    if (this.attentionInFlight) {
      this.pendingAttention = trigger;
      return;
    }
    void this.runAttention(trigger);
  }

  private async runAttention(trigger: FrameTrigger): Promise<void> {
    this.attentionInFlight = true;
    this.emit();
    try {
      const md = await callAttention(this.env, {
        docs: renderDocs(this.input.docs),
        brief:
          this.mode === 'session' && this.drawn.length > 0
            ? JSON.stringify(
                {
                  spread: this.spreadClass,
                  dilemma: this.dilemma,
                  cards: this.drawn.map(({ slot, card, position }) => {
                    const flipped = this.flipped.includes(slot);
                    return {
                      slot,
                      position,
                      flipped,
                      ...(flipped
                        ? { symbols: card.symbols, charge: card.charge, shadow: card.shadow }
                        : {}),
                    };
                  }),
                },
                null,
                2,
              )
            : '(no cards on the table yet — omit dressings)',
        taboos: this.taboos().join('; ') || '(none)',
        conversation: this.renderBeats(this.c.BEATS_WINDOW_ATTN),
        piles: [
          `reads:\n${renderTail(this.piles.reads.tail(this.c.TAIL_READS * 2), fmtRead)}`,
          `profile (whole):\n${this.profile.render()}`,
          `dilemma document:\n${renderDilemma(this.dilemma)}`,
        ].join('\n\n'),
        frame: this.frames.current().md,
        trigger,
      });
      this.frames.push(md.trim(), trigger);
      this.turnsSinceFrameRegen = 0;
    } catch {
      /* attention throws: frame lags, session continues */
    }
    this.attentionInFlight = false;
    this.emit();
    if (this.pendingAttention) {
      const next = this.pendingAttention;
      this.pendingAttention = null;
      void this.runAttention(next);
    }
  }

  // ------------------------------------------------------------- context

  /** the clock — a reading is never left on the table */
  private beatsRemaining(): number {
    return Math.max(0, this.c.BEATS_BUDGET - Math.max(0, this.oracleBeatCount() - 2));
  }

  private oracleBeatCount(): number {
    return this.scroll.filter((e): e is Beat => e.kind === 'beat' && e.speaker === 'oracle')
      .length;
  }

  private visitorSpoke(): boolean {
    return this.scroll.some((e) => e.kind === 'beat' && e.speaker === 'visitor');
  }

  private visitorText(): string {
    return this.scroll
      .filter((e): e is Beat => e.kind === 'beat' && e.speaker === 'visitor')
      .map((b) => b.text)
      .join('\n');
  }

  private anchor(): Anchor {
    // turns are performed beats; the two scripted boot beats aren't
    const turn = Math.max(0, this.oracleBeatCount() - 2);
    return { turn, beat: Math.max(0, this.scroll.length - 1) };
  }

  private stage(): StageId {
    return deriveStage({
      mode: this.mode,
      scroll: this.scroll,
      dealt: this.drawn.length > 0,
      flippedCount: this.flipped.length,
      spreadSize: Math.max(1, this.drawn.length),
      namingDelivered: this.namingDelivered,
      phase: this.phase,
    });
  }

  private ratio(): number {
    return talkRatio(this.scroll, this.c);
  }

  private carry(): boolean {
    return carryFromScroll(this.scroll, this.c);
  }

  private taboos(): string[] {
    return this.input.taboos ?? [];
  }

  private renderBeats(window: number): string {
    const beats = this.scroll.filter((e): e is Beat => e.kind === 'beat');
    const slice = window === Infinity ? beats : beats.slice(-window * 2);
    if (slice.length === 0) return '(nothing spoken yet)';
    return slice
      .map((b) => `${b.speaker}: ${b.text}${b.truncated ? ' [cut off here by the visitor]' : ''}`)
      .join('\n');
  }

  private renderFanDelta(): string {
    const entries = this.scroll.filter((e): e is Beat => e.kind === 'beat');
    if (entries.length === 0) return '(nothing spoken yet)';
    const newFrom = this.scroll
      .slice(0, this.lastFanScrollIndex)
      .filter((e) => e.kind === 'beat').length;
    const contextStart = Math.max(0, newFrom - this.c.FAN_DELTA_OVERLAP * 2);
    return entries
      .slice(contextStart)
      .map((b, i) => {
        const isNew = contextStart + i >= newFrom;
        return `${isNew ? 'NEW ' : ''}${b.speaker}: ${b.text}`;
      })
      .join('\n');
  }

  private describeEvent(event: EnsembleEvent): string {
    switch (event.type) {
      case 'open':
        return `the opening. scenario: ${this.input.scenario}`;
      case 'visitor_line':
        return 'the visitor just spoke; their line is the last beat of the conversation.';
      case 'card_flip': {
        const drawn = this.drawn.find((d) => d.slot === event.slot);
        if (!drawn) return `card flip ${event.flip_number}.`;
        const { card, position } = drawn;
        return [
          `card flip ${event.flip_number} of ${this.drawn.length}, slot ${event.slot}.`,
          `its position's job: ${position}.`,
          `the card's imagery: ${card.symbols.join('; ')}.`,
          `its charge: ${card.charge}${card.shadow ? ` | its shadow: ${card.shadow}` : ''}.`,
          `the read = position job × card charge × dilemma state. one image. end with a handle (tell me if that's not it, in her words).`,
        ].join(' ');
      }
      case 'silence':
        return 'the visitor has let the silence run.';
    }
  }

  private driverPayload(event: EnsembleEvent, menu: BeatType[]) {
    const capN = cap(this.budget, this.carry(), this.c);
    const mandated = menu.length === 1 ? ` — MANDATED: ${menu[0]} (structure binds; anything else is clamped)` : '';
    const bankedNote =
      this.thoughtsSinceAmmo >= this.c.BANKED_THOUGHTS
        ? ` | banked: ${this.thoughtsSinceAmmo} unspent inner-voice guesses — if one is ripe, spend it as ammo`
        : '';
    const table =
      this.drawn.length === 0
        ? 'the table: empty — no cards dealt yet.'
        : `the table: ${SPREADS[this.spreadClass ?? 'UNKNOWN'].name} (${this.spreadClass}). ` +
          this.drawn
            .map(
              (d) =>
                `slot ${d.slot} "${d.position}" ${this.flipped.includes(d.slot) ? `= ${d.card.name}` : '(face down)'}`,
            )
            .join(' · ');
    const cognition = [
      `reads, newest last (their "thinking" lines are ammo candidates):\n${renderTail(this.piles.reads.tail(this.c.TAIL_READS), fmtRead)}`,
      `coherence now: ${this.coherence}/3${this.coherence <= 1 ? ' — ANCHOR MODE: short, concrete, sensory; no excavation' : ''}`,
      `profile (${this.profile.size()}/14):\n${this.profile.render()}`,
      `question targets (profiler-elevated):\n${this.profile.elevated.map((e) => `- ${e.facet}: ${e.angle}`).join('\n') || '(none yet)'}`,
      `dilemma document (class: ${this.dilemmaClass ?? 'not yet classified'}):\n${renderDilemma(this.dilemma)}`,
      this.pendingGuess && !this.guessPlayed
        ? `PENDING GUESS — playable via the guess beat, verbatim:\n"${this.pendingGuess}"`
        : 'pending guess: (none)',
    ].join('\n\n');
    return {
      mode: this.mode,
      taboos: this.taboos().join('; ') || '(none)',
      docs: renderDocs(this.input.docs),
      frame: this.frames.current().md,
      conversation: this.renderBeats(this.c.BEATS_WINDOW_DRIVER),
      cognition,
      goals: this.renderGoals(),
      table,
      menu: `MENU: [${menu.join(' · ')}]${mandated} | questions asked ${this.questionsAsked}/${this.c.QUESTION_BUDGET} | beats remaining ${this.beatsRemaining()}`,
      economy: `F-beat cap ${capN} words | visitor talk-share ${this.ratio().toFixed(2)} | carry ${this.carry()}${bankedNote}`,
      event: this.describeEvent(event),
    };
  }

  private renderGoals(): string {
    const stage = this.stage();
    const goals = [...stageGoals(this.mode, stage)];
    const T = this.beatsRemaining();
    if (T <= 6 && this.phase === 'live') {
      goals.unshift(
        `P0 LANDING: ${T} beats remain. begin descent — spend banked material, no new territory, aim at the naming (or the charm) and the close.`,
      );
    }
    if (goals.length === 0) return `stage: ${stage} | (no standing goals)`;
    return [`stage: ${stage} — P0 highest`, ...goals].join('\n');
  }

  /** F-beat assignment: reads and honor get earned room; tissue stays tiny */
  /** how well she knows them, 0-4 — grown from evidence, rendered as
   *  personality: humble early by construction, earned certainty late */
  private familiarity(): { level: number; text: string } {
    const lvls = [
      "you don't know this person at all yet — you have no right to a read, only to curiosity",
      'an inkling — one thread worth pulling, nothing more',
      'a shape of them is forming — you can lean on what they gave you, carefully',
      'you know what this is about now — your read has earned some weight',
      "you know this person fairly well by now — say what you see plainly; you've earned it",
    ];
    let n = 0;
    if (this.profile.size() >= 2 || this.pendingGuess) n = 1;
    if (this.profile.size() >= 5 || this.dilemmaClass) n = 2;
    if (dilemmaCommitted(this.dilemma)) n = 3;
    if (this.namingDelivered) n = 4;
    return { level: n, text: lvls[n] };
  }

  private assignment(intent: Intent, event: EnsembleEvent): string {
    const capN = cap(this.budget, this.carry(), this.c);
    const lines: string[] = [];
    lines.push(`beat: ${intent.beat}`);
    const fam = this.familiarity();
    lines.push(`familiarity: level ${fam.level}/4 — ${fam.text}`);
    lines.push(
      `license: ${fam.level <= 1 ? 'clarify — questions and small acknowledgments only; no reads' : fam.level === 2 ? 'guess — the offstage guess may play, plainly, as a question' : 'synthesize — a logline of THEIR material may be handed back'}`,
    );
    lines.push(`accomplish: ${intent.accomplish}`);
    if (intent.beat === 'read') {
      const slot = event.type === 'card_flip' ? event.slot : this.flipped[this.flipped.length - 1];
      const drawn = this.drawn.find((d) => d.slot === slot);
      if (drawn) {
        lines.push(`the position's job: ${drawn.position}`);
        lines.push(`the card's imagery: ${drawn.card.symbols.join('; ')}`);
        lines.push(`its charge: ${drawn.card.charge}`);
        if (this.namingDelivered) {
          lines.push('the naming is spoken: aim this card at the named fork.');
        }
      }
      lines.push('plain beats poetic: say what the card sees in them straight; lean on the imagery only if it lands harder than the plain sentence. at most one image. end with a handle: tell me if that is not it, in your words.');
    }
    if (intent.ammo) lines.push(`ammo, their UNSAID inner voice — never present it as their words: "${intent.ammo}"`);
    const words =
      intent.beat === 'tissue'
        ? Math.min(intent.approx_words, this.c.TISSUE_CAP)
        : intent.beat === 'read' || intent.beat === 'honor'
          ? Math.max(Math.min(intent.approx_words, this.c.CAP_MAX), 24)
          : Math.min(intent.approx_words, capN);
    lines.push(
      intent.beat === 'tissue'
        ? `cap ${words} words. two is a fine number.`
        : `up to ${words} words. take the room this needs, not a word more.`,
    );
    return lines.join('\n');
  }
}

/** models sometimes wrap the line in quotes or prepend a speaker tag —
 *  strip transport artifacts, never rewrite content. */
function sanitizeLine(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^(oracle|seer|wildcard):\s*/i, '');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('“') && s.endsWith('”'))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
