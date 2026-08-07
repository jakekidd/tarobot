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
import { ALMANAC } from './almanac';
import { pickPreshow } from './preshow';
import { ORACLE_DECK } from '../oracle/deck';
import {
  callAttention,
  callConjector,
  callConsent,
  callRefusable,
  callDriver,
  callInterpreter,
  callInvestigator,
  callPauseAdditions,
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
  NEVER_SAY_LOWER,
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
  /** offer-loop intake: a warm/hot grade arms the shortcut */
  private warmGuessSeen = false;
  /** a HOT grade without a classify arms this: the next conjector
   *  cycle is mandated to commit (more hunting after hot is time
   *  stolen from the cards — quiet probe, 2026-08-06) */
  private classifyMandate = false;
  /** the guess text actually spoken last — grades must attribute to
   *  the PLAYED words, not whatever is pending now (talker probe) */
  private lastPlayedGuess: string | null = null;
  /** offer-loop intake: talk turns since a probe was handed over */
  private talksSinceProbe = 99;
  /** offer-loop intake: consecutive hosted turns spent in a visitor
   *  drought (carry() true, no candidate) — two of them and the cards
   *  take the lead themselves */
  private droughtTalks = 0;
  private holderFlip = false;
  /** the scene she was in before the visitor sat down — one rotation
   *  per session, hers alone (prepended to her context, never spoken) */
  private preshow = pickPreshow();
  /** the pregnant-pause bank: speculative additions written the moment
   *  her line lands, spoken at zero latency if the visitor stays quiet */
  private pauseAdds: { lines: string[]; next: number; atBeatCount: number } | null = null;
  private pauseGenInFlight = false;
  private conjectorInFlight = false;
  private pendingConjector = false;
  private conjectorSeenBeats = 0;
  private duplicatePassages = 0;
  private promptedStats: Record<string, { attempts: number; fallbacks: number }> = {};

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
  /** the offer awaiting the visitor's answer (verbatim, for the judge) */
  private pendingOffer: string | null = null;
  private consentVerdict: 'yes' | 'no' | 'ambivalent' | null = null;
  private consentNonYes = 0;
  /** declined territories — fed to the conjector as cold grades */
  private focusRejections: string[] = [];
  private guessCount = 0;
  private lastOracleBeatType: BeatType | null = null;
  private greetingVariant = 0;
  private handleOrder: number[] = [];
  private handleIdx = 0;
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
      pauseBank:
        this.pauseAdds && this.pauseAdds.atBeatCount === this.oracleBeatCount()
          ? this.pauseAdds.lines.length - this.pauseAdds.next
          : 0,
      beatsRemaining: this.beatsRemaining(),
      coherence: this.coherence,
      questionsAsked: this.questionsAsked,
      promptedStats: JSON.parse(JSON.stringify(this.promptedStats)) as Record<string, { attempts: number; fallbacks: number }>,
      busy: this.busy,
      lastIntent: this.lastIntent,
      fanInFlight: this.fanInFlight,
      attentionInFlight: this.attentionInFlight,
      conjectorInFlight: this.conjectorInFlight,
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
    this.maybePauseAdditions();
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
  private flushInFlight = false;

  async flushLanding(): Promise<void> {
    if (this.phase !== 'live' || this.flushInFlight) return;
    this.flushInFlight = true;
    this.note('FLUSH: visitor-side termination — speaking the landing');
    const myGen = ++this.gen;
    this.busy = 'persona';
    this.emit();
    try {
      if (this.namingConditions() && !this.namingDelivered) {
        await this.performNaming(myGen);
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
      this.flushInFlight = false;
      this.busy = null; // unconditional: a stuck busy would freeze the room
      this.emit();
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
        // the ritual outranks passage freshness this late — speak the
        // committed doc even if an edit is in flight (one cycle stale)
        this.note(`landing ramp T-${T}: naming mandated${this.conjectorInFlight ? ' (conjector in flight; speaking committed doc)' : ''}`);
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
        // the consent gate: once the conjector lands a focus, offer it.
        // the DETECTOR owns acceptance — the driver cannot deal without
        // a yes verdict; two non-yes answers route to exploration.
        if (this.focusPhrase && this.focusStage === 0) return ['focus'];
        if (this.focusStage === 1 || this.focusStage === 2) {
          if (this.consentNonYes >= 2) return ['focus']; // renderBeat jumps to exploration
          if (this.consentVerdict === 'no') return ['focus']; // the alt is owed promptly
          // ambivalent: neither deal nor re-offer; clarify via tissue/question
        }
        // the rant path: fallback after a refusal, escape ends intake
        beats.push('rant_bid');
        // the deal opens once there is anything to deal on — and NEVER
        // while consent is unresolved (the detector owns acceptance)
        if (this.visitorSpoke() && (this.focusPhrase ? this.focusStage >= 3 : true)) beats.push('deal');
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

  // ------------------------------------------------- the offer loop
  // (COMPOUNDING.md §5) pre-deal, intake:'investigator' replaces the
  // driver/fan cast with one interviewer over the raw transcript. the
  // conjector hunts beside it; the house owns offer timing; the
  // visitor grades the one bet. post-deal converges on the ensemble.

  private investigatorIntake(): boolean {
    return (
      this.input.intake === 'investigator' &&
      this.mode === 'session' &&
      this.drawn.length === 0 &&
      this.phase === 'live'
    );
  }

  private offerReady(): boolean {
    return (
      this.focusPhrase !== null &&
      this.focusStage === 0 &&
      this.consentNonYes < 2 &&
      (this.warmGuessSeen || this.beatsRemaining() <= 6)
    );
  }

  /** bank three pause additions for the just-committed beat. fired
   *  after every intake commit; speculative and off the hot path. */
  private maybePauseAdditions(): void {
    if (!this.investigatorIntake() || this.pauseGenInFlight) return;
    const at = this.oracleBeatCount();
    if (this.pauseAdds && this.pauseAdds.atBeatCount === at && this.pauseAdds.next < this.pauseAdds.lines.length) {
      return; // bank still fresh
    }
    this.pauseGenInFlight = true;
    const myGen = this.gen;
    void (async () => {
      try {
        const out = await callPauseAdditions(this.env, {
          transcript: this.renderBeats(Infinity),
          preshow: this.preshow ?? undefined,
        });
        if (myGen !== this.gen || this.oracleBeatCount() !== at || !this.investigatorIntake()) return;
        const lines = [out.first, out.second, out.third]
          .map((l) => sanitizeLine(l))
          .filter((l) => l.length > 0 && !this.fossilOutsideQuotes(l) && this.quotedSpansVerified(l));
        if (lines.length > 0) {
          this.pauseAdds = { lines, next: 0, atBeatCount: at };
          this.note(`pause additions banked (${lines.length})`);
          this.emit();
        }
      } catch {
        /* speculative — nothing lost */
      } finally {
        this.pauseGenInFlight = false;
      }
    })();
  }

  /** the UI's pregnant-pause hook: speak the next banked addition at
   *  zero latency. the bank rerolls once it empties. a send always
   *  outranks this (entries are gated on busy; a stale bank no-ops). */
  speakPauseAddition(): void {
    if (this.phase !== 'live' || this.busy !== null || !this.investigatorIntake()) return;
    // a landed candidate outranks small talk: the pause becomes the
    // offer (routed through a silence dispatch so the gate machinery
    // and the busy state run normally)
    if (this.offerReady()) {
      this.silenceTick();
      return;
    }
    const p = this.pauseAdds;
    if (!p || p.atBeatCount !== this.oracleBeatCount() || p.next >= p.lines.length) {
      this.maybePauseAdditions();
      return;
    }
    const line = p.lines[p.next++];
    this.scroll.push({ kind: 'ev', ev: 'silence', t: Date.now() });
    this.note(`pregnant pause — addition ${p.next}/${p.lines.length} spoken`);
    this.commitOracle(line, 'talk');
    // the bank stays valid across its own additions (each was written
    // to stand after the previous); reroll once it drains
    p.atBeatCount = this.oracleBeatCount();
    if (p.next >= p.lines.length) this.maybePauseAdditions();
    this.emit();
  }

  private async investigatorTurn(event: EnsembleEvent, myGen: number): Promise<void> {
    // yes already judged → the commit: reflect over the record, deal
    if (this.focusStage === 3) {
      await this.reflectAndDeal(myGen);
      return;
    }
    // two nos → exploration owed, no third offer
    if (this.consentNonYes >= 2) {
      this.busy = 'persona';
      this.emit();
      try {
        this.focusStage = 4;
        this.dilemmaClass = null;
        this.note('two non-yes verdicts → EXPLORATION (mind-heart-root)');
        await this.performDeal(
          'EXPLORATION',
          {
            beat: 'deal',
            accomplish: 'exploration — the offers were declined',
            approx_words: 0,
            note: 'investigator: consent declined twice',
          },
          myGen,
        );
      } finally {
        if (myGen === this.gen) this.busy = null;
        this.emit();
      }
      return;
    }
    // the shortcut: a candidate landed with a warm guess behind it (or
    // the clock is closing) → make the offer instead of another turn.
    // silence qualifies too — a candidate that lands after the room
    // went quiet still gets offered ("you went quiet. i think it's
    // this"), otherwise a quiet visitor never hears the one bet.
    if (this.offerReady()) {
      this.busy = 'persona';
      this.emit();
      try {
        await this.renderBeat(
          {
            beat: 'focus',
            accomplish: 'the offer — is this the thing',
            approx_words: 0,
            note: 'investigator: candidate strong, shortcut taken',
          },
          event,
          myGen,
        );
      } finally {
        if (myGen === this.gen) this.busy = null;
        this.emit();
      }
      this.maybePauseAdditions();
      return;
    }
    // the host's funnel: a visitor who volunteers nothing still gets a
    // reading. carry() = thin turns in a row; after two hosted attempts
    // the cards take the lead themselves (UNKNOWN imposes no lens, so
    // no consent is owed — same law as the rant escape).
    const drought = this.carry() && this.focusPhrase === null && this.visitorSpoke();
    if (drought && this.droughtTalks >= 2) {
      this.busy = 'persona';
      this.emit();
      try {
        this.note('drought funnel: they gave the room nothing twice hosted — the cards start the show');
        await this.performDeal(
          'UNKNOWN',
          {
            beat: 'deal',
            accomplish: 'cards first, talk after — the flips do the eliciting',
            approx_words: 0,
            note: 'investigator: drought funnel',
          },
          myGen,
        );
      } finally {
        if (myGen === this.gen) this.busy = null;
        this.emit();
      }
      return;
    }
    // otherwise: talk. the conjector hunts in parallel off the same page.
    this.maybeConjector();
    const probe =
      this.pendingGuess !== null && !this.guessPlayed && this.talksSinceProbe >= 2
        ? this.pendingGuess
        : null;
    // her night (PULSE P2): existing graded state rendered as mood,
    // computed fresh each turn, never persisted
    let lastVisitorWords = 0;
    for (let i = this.scroll.length - 1; i >= 0; i--) {
      const e = this.scroll[i];
      if (e.kind === 'beat' && e.speaker === 'visitor') {
        lastVisitorWords = countWords(e.text);
        break;
      }
    }
    const mood =
      this.lastGuessGrade === 'hot'
        ? 'relish — the last guess landed clean'
        : drought
          ? 'working — she is carrying the room tonight'
          : this.beatsRemaining() <= 6
            ? 'closing — the night is running out, and it is her night too'
            : this.focusRejections.length > 0
              ? 'rueful — a door got closed earlier; it stays closed'
              : 'settling — an ordinary night at the table';
    // 15 matches the conjector wake threshold — crier disclosures ran
    // 17-21 words and the 25-word gate never armed (pulse-crier probe)
    const moodLine =
      lastVisitorWords >= 15
        ? `${mood} | not this turn — their material owns this one`
        : mood;
    const talks = this.scroll.filter(
      (e) => e.kind === 'beat' && e.speaker === 'oracle' && e.beatType === 'talk',
    );
    const lastTwoQuestions =
      talks.length >= 2 && talks.slice(-2).every((b) => b.kind === 'beat' && b.text.trim().endsWith('?'));
    this.busy = 'persona';
    this.emit();
    try {
      const out = await callInvestigator(this.env, {
        transcript: this.renderBeats(Infinity),
        docs: renderDocs(this.input.docs),
        taboos: this.taboos().join('; ') || '(none)',
        probe: probe ?? undefined,
        declined: this.focusRejections,
        clock: `beats remaining ${this.beatsRemaining()} of ${this.c.BEATS_BUDGET}${this.beatsRemaining() <= 6 ? ' — begin landing: no new territory' : ''}`,
        size: drought
          ? `they are thin — the room is yours to host: up to roughly ${Math.ceil(cap(this.budget, this.carry(), this.c) / 5) * 5 + 10} words if the move needs them. spend them drawing THEM out, never filling the air.`
          : `roughly ${Math.ceil(cap(this.budget, this.carry(), this.c) / 5) * 5} words, give or take a breath — a ballpark, not a count. the interview stays visitor-led: they should out-talk you.`,
        host: drought
          ? `they are underfeeding — thin turns in a row. you drive now: name the quiet plainly if it helps, make the smallest concrete ask, or offer to let the cards start it. from her own book, if one fits tonight (use it, reshape it, or ignore them): ${[...BEATS.host].sort(() => Math.random() - 0.5).slice(0, 2).map((h) => `"${h}"`).join(' / ')}. the show moves toward the table either way.`
          : undefined,
        mood: moodLine,
        rhythm: lastTwoQuestions
          ? 'two question-ending turns in a row already — end this one without a question mark (an observe, a bet, a give)'
          : undefined,
        almanac: ALMANAC,
        preshow: this.preshow ?? undefined,
        event:
          event.type === 'silence' ? 'the visitor has let the silence run.' : 'the visitor just spoke.',
      });
      if (myGen !== this.gen) return;
      const line = sanitizeLine(out.spoken);
      const fossil = line ? this.fossilOutsideQuotes(line) : null;
      const rejected = !line || fossil !== null || !this.quotedSpansVerified(line);
      if (rejected) {
        this.note(
          `investigator line rejected (${!line ? 'empty' : fossil ? `fossil "${fossil}"` : 'unverified quote'}) — authored holder spoken`,
        );
        // a heavy disclosure deserves a receipt-shaped holder, not a
        // demand-lite; light holders rotate so the room never hears
        // the same holder twice (skeptic re-run: verbatim repeat tell)
        this.holderFlip = !this.holderFlip;
        this.commitOracle(
          lastVisitorWords >= 15 ? 'mm.' : this.holderFlip ? 'mm. keep going.' : 'go on.',
          'talk',
        );
        this.talksSinceProbe += 1;
      } else {
        this.commitOracle(line, 'talk');
        if (probe) {
          this.guessPlayed = true;
          this.lastPlayedGuess = probe;
          this.talksSinceProbe = 0;
          this.note(`probe handed to the investigator: "${probe}"`);
        } else {
          this.talksSinceProbe += 1;
        }
      }
      this.droughtTalks = drought ? this.droughtTalks + 1 : 0;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.commitOracle('mm. keep going.', 'talk');
    } finally {
      if (myGen === this.gen) this.busy = null;
      this.emit();
    }
    this.maybePauseAdditions();
  }

  /** the commit event: the visitor said yes to the offered dilemma.
   *  ONE reflection pass over the whole record rewrites the document
   *  with the confirmed dilemma as its lens; then the cards. */
  private async reflectAndDeal(myGen: number): Promise<void> {
    this.busy = 'persona';
    this.emit();
    try {
      if (this.conjectorInFlight) {
        this.note('reflection skipped (conjector edit in flight) — the standing document deals');
      } else {
        this.note('OFFER accepted — one reflection pass over the whole record');
        try {
          const out = await callConjector(this.env, {
            profile: '(investigator intake: the transcript below is the profile)',
            table: '(no cards yet)',
            conversation: this.renderBeats(Infinity),
            prevGuess: `the visitor CONFIRMED to the oracle's face that tonight is about: "${this.focusPhrase ?? '(the offered thing)'}"`,
            dilemma: renderDilemma(this.dilemma),
            ask: 'REFLECTION: they said yes. re-read the ENTIRE conversation cold and write the document over from the record — class (FORK|THRESHOLD|LOOP|WEIGHT) + problem_md + options_md, their words where possible; optionally plant (one deck card id). anything the full record shows supersedes the standing draft.',
          });
          if (myGen !== this.gen) return;
          if (out.class) this.dilemmaClass = out.class;
          if (out.problem_md) this.dilemma.problem_md = out.problem_md;
          if (out.options_md) this.dilemma.options_md = out.options_md;
          if (out.plant) this.plantId = out.plant;
        } catch {
          this.note('reflection failed — the classify-time draft stands');
        }
      }
      await this.performDeal(
        this.dilemmaClass ?? 'UNKNOWN',
        {
          beat: 'deal',
          accomplish: 'the confirmed dilemma comes to the table',
          approx_words: 0,
          note: 'investigator: offer accepted',
        },
        myGen,
      );
    } finally {
      if (myGen === this.gen) this.busy = null;
      this.emit();
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

    // silence after an offer: no words is an answer — ambivalent
    if (event.type === 'silence' && this.pendingOffer && (this.focusStage === 1 || this.focusStage === 2)) {
      this.consentVerdict = 'ambivalent';
      this.consentNonYes += 1;
      this.note(`CONSENT verdict: ambivalent (silence after the offer; non-yes ${this.consentNonYes})`);
    }

    // the consent detector: an offer's answer gets a mechanical verdict
    // BEFORE the menu is computed — deal legality depends on it
    if (
      event.type === 'visitor_line' &&
      this.pendingOffer &&
      (this.focusStage === 1 || this.focusStage === 2)
    ) {
      const reply = this.lastVisitorText();
      const offerAtCall = this.pendingOffer;
      // the judgment occupies the hot path: settle()/the input gate must
      // wait it out. without this, rapid follow-up lines void every
      // in-flight verdict and the gate starves — two probe runs ended
      // stage:intro with 5/5 consent calls discarded exactly this way.
      this.busy = 'judge';
      this.emit();
      let verdict: 'yes' | 'no' | 'ambivalent';
      try {
        verdict = await callConsent(this.env, this.pendingOffer, reply);
      } catch {
        verdict = 'ambivalent';
      } finally {
        // entries are gated on busy, so nothing else owns it during judge
        this.busy = null;
      }
      // staleness: a newer event or a changed offer voids this verdict
      if (myGen !== this.gen || this.pendingOffer !== offerAtCall) return;
      this.consentVerdict = verdict;
      this.note(
        `CONSENT verdict: ${this.consentVerdict} — evidence: "${reply.slice(0, 120)}"`,
      );
      if (this.consentVerdict === 'yes') {
        this.focusStage = 3;
        this.pendingOffer = null;
        this.note('focus accepted (detector, with evidence)');
      } else if (this.consentVerdict === 'no') {
        this.consentNonYes += 1;
        if (this.focusPhrase) this.focusRejections.push(this.focusPhrase);
        this.pendingOffer = null;
        if (this.investigatorIntake()) {
          // offer loop: a no sends her back to the conversation — the
          // candidate is burned, the hunt re-roots, the next offer must
          // come from fresh ground (two nos still owe exploration)
          this.focusStage = 0;
          this.focusPhrase = null;
          this.altFocus = null;
          this.dilemmaClass = null;
          this.note('offer declined — candidate burned, back to the conversation');
        }
        this.maybeConjector(true); // the rejection is a cold grade on that territory
      } else {
        this.consentNonYes += 1; // ambivalent: deal stays illegal; the room clarifies
      }
      if (myGen !== this.gen) return;
    }

    // the offer loop owns intake when selected — no menu, no driver,
    // no fan; the conjector hunts from inside investigatorTurn
    if (this.investigatorIntake()) {
      await this.investigatorTurn(event, myGen);
      return;
    }

    this.trackReadiness();
    const menu = this.menu(event);
    this.note(
      `menu [${menu.join(' · ')}]${menu.length === 1 ? ' — MANDATED' : ''} ← ${event.type}, stage ${this.stage()}, coherence ${this.coherence}, T-${this.beatsRemaining()}`,
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
      this.busy = 'persona'; // occupy the hot path — settle() must wait
      this.emit();
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
        if (this.consentNonYes >= 2 && this.focusStage >= 1) {
          // two non-yes answers: exploration is owed, no third offer
          this.focusStage = 4;
          this.dilemmaClass = null;
          this.note('two non-yes consent verdicts → EXPLORATION (mind-heart-root)');
          await this.performDeal('EXPLORATION', intent, myGen);
          return;
        }
        if (this.focusStage === 0 && this.focusPhrase) {
          const text = await this.promptedLine(
            'focus',
            `they are owed the offer. using their own nouns for it — "${this.focusPhrase}" — ask whether that is the real thing to look at tonight. a short receipt clause first is fine, then ONE refusable yes-or-no ask, nothing appended after it. her voice, their words; no "or is it..." fishing, no second question. the move is the asking.`,
            (line) => this.focusLineValid(line, this.focusPhrase!),
            BEATS.focus.offer.replace('{PASSAGE:focus}', this.focusPhrase),
            myGen,
            `here's where i keep landing: ${this.focusPhrase}. that okay to sit with?`,
          );
          if (myGen !== this.gen) return;
          this.commitOracle(text, 'focus');
          this.focusStage = 1;
          this.pendingOffer = text;
          this.consentVerdict = null;
          this.note(`focus offered: "${this.focusPhrase}"`);
        } else if (this.focusStage === 1 && this.altFocus) {
          const text = await this.promptedLine(
            'focus',
            `they said no. offer the other thing you saw — "${this.altFocus}" — as a yes-or-no question, taking the miss in stride. one short sentence, plain: no imagery, no second question stacked on.`,
            (line) => this.focusLineValid(line, this.altFocus!),
            BEATS.focus.alt.replace('{PASSAGE:focus}', this.altFocus),
            myGen,
            `fair. what about ${this.altFocus} — closer?`,
          );
          if (myGen !== this.gen) return;
          this.commitOracle(text, 'focus');
          this.focusPhrase = this.altFocus;
          this.altFocus = null;
          this.focusStage = 2;
          this.pendingOffer = text;
          this.consentVerdict = null;
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
        await this.performDeal(
          this.focusStage === 4 ? 'EXPLORATION' : (this.dilemmaClass ?? 'UNKNOWN'),
          intent,
          myGen,
        );
        return;
      }

      case 'naming': {
        await this.performNaming(myGen);
        return;
      }

      case 'guess': {
        if (this.pendingGuess) {
          const text = assemble(BEATS.guess.text, {}, { guess: this.pendingGuess });
          this.commitOracle(text, 'guess');
          this.guessPlayed = true;
          this.lastPlayedGuess = this.pendingGuess;
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
    beatType: string,
    beatPrompt: string,
    valid: (line: string) => boolean | Promise<boolean>,
    fallback: string,
    myGen: number,
    corpse?: string,
  ): Promise<string> {
    const stat = (this.promptedStats[beatType] ??= { attempts: 0, fallbacks: 0 });
    stat.attempts += 1;
    const corpseLine = corpse
      ? `\nthe retired house line — file it as too_safe, never speak it: "${corpse}"`
      : '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await callPersona(this.env, {
          conversation: this.renderBeats(Infinity),
          frame: this.frames.current().md,
          assignment: `beat prompt: ${beatPrompt}${corpseLine}\nfamiliarity: level ${this.familiarity().level}/4 — ${this.familiarity().text}`,
        });
        if (myGen !== this.gen) return fallback;
        const line = out.spoken.trim();
        const fossil = line ? this.fossilOutsideQuotes(line) : null;
        if (fossil) {
          this.note(`beat-prompt line spoke a fossil ("${fossil}") — rejected`);
        } else if (line && (await valid(line))) return line;
        else this.note(`beat-prompt line failed its postcondition (attempt ${attempt + 1})`);
      } catch {
        /* retry, then fallback */
      }
    }
    stat.fallbacks += 1;
    this.note(`FALLBACK spoken on ${beatType} (authored line entered the transcript; rate ${stat.fallbacks}/${stat.attempts})`);
    return fallback;
  }

  private static normQuotes(t: string): string {
    return t.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  }

  /** any double-quoted span in an oracle line must be the visitor's
   *  actual words — the QUOTE guarantee, lifted to whole lines */
  private quotedSpansVerified(line: string): boolean {
    const norm = EnsembleEngine.normQuotes(line);
    const spans = [...norm.matchAll(/"([^"]{8,})"/g)];
    if (spans.length === 0) return true;
    const haystack = EnsembleEngine.normQuotes(this.visitorText());
    return spans.every((m) => haystack.includes(m[1]));
  }

  /** fossil scan that ignores verified quoted spans (their words, not hers) */
  private fossilOutsideQuotes(line: string): string | null {
    const stripped = EnsembleEngine.normQuotes(line).replace(/"[^"]*"/g, ' ');
    for (const phrase of NEVER_SAY_LOWER) if (stripped.includes(phrase)) return phrase;
    return null;
  }

  /** question postcondition: askable, short, quotes verified */
  private questionValid(line: string): boolean {
    const askable =
      line.includes('?') ||
      /^(who|what|when|where|why|how|is|are|do|does|did|was|were|say|tell|walk|give)\b/i.test(line);
    // 40 is a runaway guard, not the shaping — the ballpark in the
    // beat prompt does the shaping (economy is soft, structure binds)
    return askable && countWords(line) <= 40 && this.quotedSpansVerified(line);
  }

  /** the consent gate's postcondition: carries the focus content and is
   *  REFUSABLE — could a stranger comfortably say no (function, not
   *  punctuation; judged fast-tier) */
  private async focusLineValid(line: string, focus: string): Promise<boolean> {
    // 36 fits a receipt clause + the ask (PULSE P5); still a runaway guard
    if (countWords(line) > 36) return false;
    // strip punctuation from tokens — "alone," could never match "alone"
    const fw = focus
      .toLowerCase()
      .replace(/[^a-z\s']/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    if (fw.length > 0) {
      const hits = fw.filter((w) => line.toLowerCase().includes(w)).length;
      if (hits / fw.length < 0.5) return false;
    }
    try {
      return await callRefusable(this.env, line);
    } catch {
      return line.includes('?');
    }
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
        // a fill that parrots the skeleton's own words produces a spoken
        // stutter ("the thing you already decided... the thing you
        // already decided") — reject the echo (skeptic probe)
        if (failures.length === 0) {
          const skelNorm = skeleton.toLowerCase();
          for (const s of fillable) {
            const t = (got[s.key] ?? '').trim().toLowerCase();
            if (t.length > 8 && skelNorm.includes(t)) {
              failures.push({ key: s.key, reason: 'echoes the skeleton text' });
              break;
            }
          }
        }
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

  /** questions are BEAT PROMPTS now (the register seams): the persona
   *  asks the frame's FUNCTION her way; the old skeleton is the named
   *  corpse; the slotless authored variant is the fallback. kills the
   *  conjugation bug class by construction. */
  private async performQuestion(intent: Intent, myGen: number): Promise<void> {
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
    const aim = intent.target ?? intent.accomplish;
    const FUNCTIONS: Record<QuestionFrame, string> = {
      THREAD: `take a phrase they ACTUALLY used about ${aim}, hand it back (verbatim if quoted), and ask what's under it. one question.`,
      KIND: `ask one are-you-the-kind-of-person question aimed at ${aim} — concrete, refusable, one breath.`,
      CONCRETE: `pin ${aim} to a real lived moment: ask when it last actually happened — the day, the scene. one question.`,
      STAKES: `a year passes and nothing about ${aim} changes: ask what breaks first. one question.`,
      MIRROR: `ask who else is inside ${aim}, and what that person would say they're doing. one question.`,
    };
    // a big disclosure earns receipt + move in ONE turn — a bare question
    // after a paragraph of real feeling reads as the machine not hearing it
    let lastVisitorWords = 0;
    for (let i = this.scroll.length - 1; i >= 0; i--) {
      const e = this.scroll[i];
      if (e.kind === 'beat' && e.speaker === 'visitor') {
        lastVisitorWords = countWords(e.text);
        break;
      }
    }
    const receipt =
      lastVisitorWords >= 25
        ? ' their last line carried real weight: open with one short receipt of it in your own words — a half-line that lands what they said, not a summary — then the question.'
        : '';
    const line = await this.promptedLine(
      'question',
      FUNCTIONS[frame] + receipt,
      (l) => this.questionValid(l),
      entry.fallback ?? entry.text,
      myGen,
      entry.text,
    );
    if (myGen !== this.gen) return;
    this.commitOracle(line, 'question');
    this.questionsAsked += 1;
    this.questionsSinceGuess += 1;
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
      const wanted = this.plantId.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z-]/g, '');
      // models drop the "of": five-cups → five-of-cups
      const plant =
        ORACLE_DECK.find((c) => c.id === wanted) ??
        ORACLE_DECK.find((c) => c.id === wanted.replace(/^([a-z]+)-(?!of-)/, '$1-of-'));
      if (plant && !cards.some((c) => c.id === plant.id)) {
        cards[Math.min(1, cards.length - 1)] = plant;
        this.note(`plant DELIVERED: ${plant.id}`);
      } else if (plant) {
        this.note(`plant already in the draw: ${plant.id}`);
      } else {
        this.note(`plant FAILED: "${this.plantId}" matches no deck id`);
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
  /** re-voicing validator: stays second person, keeps the memo's
   *  content (word overlap), adds no advice, doesn't balloon */
  private revoiceValid(line: string, source: string): boolean {
    if (!/\byou\b|\byour\b/i.test(line)) return false;
    if (/you (should|will|need to|have to|must)\b/i.test(line)) return false;
    const sw = new Set(source.toLowerCase().split(/\s+/).filter((w) => w.length >= 5));
    if (sw.size > 0) {
      const lw = line.toLowerCase();
      const hits = [...sw].filter((w) => lw.includes(w)).length;
      if (hits / sw.size < 0.4) return false;
    }
    const ratio = countWords(line) / Math.max(1, countWords(source));
    return ratio >= 0.5 && ratio <= 1.5;
  }

  private async performNaming(myGen: number): Promise<void> {
    if (!this.dilemmaClass || !dilemmaCommitted(this.dilemma)) return;
    // she re-speaks the conjector's memo in her own mouth — the memo is
    // the fallback AND the named corpse ("reading someone else's memo
    // aloud" is exactly the register to not have)
    const problem = this.dilemma.problem_md!.trim();
    const options = this.dilemma.options_md!.trim();
    const voicedProblem = await this.promptedLine(
      'naming',
      `the naming, part one — say THE PROBLEM to them, plainly, in your mouth, keeping every concrete in the memo. don't read it verbatim; don't soften it; no advice.\nthe memo:\n${problem}`,
      (l) => this.revoiceValid(l, problem),
      problem,
      myGen,
    );
    if (myGen !== this.gen) return;
    const voicedOptions = await this.promptedLine(
      'naming',
      `the naming, part two — say THE OPTIONS to them: each real road with its cost, including the one they pretend isn't there. don't read the memo verbatim; never a recommendation.\nthe memo:\n${options}`,
      (l) => this.revoiceValid(l, options),
      options,
      myGen,
    );
    if (myGen !== this.gen) return;
    const text = [
      BEATS.naming.incantations[this.dilemmaClass],
      voicedProblem,
      voicedOptions,
      BEATS.naming.release,
    ].join('\n\n');
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
    if (this.phase !== 'live') return; // double-close guard
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
        'charm',
        `${
          dilemmaCommitted(this.dilemma)
            ? `the dilemma DID get named tonight${this.focusPhrase ? ` — "${this.focusPhrase}"` : ''} — the cards just never got their full say. send them home holding the named thing, left in THEIR hands, plus ONE small true thing you actually noticed about them.`
            : `no dilemma got named tonight and that is fine — they came in light. hand them ONE small true thing you actually noticed about them as a parting gift.`
        } no advice, no fortune, nothing invented. two sentences at most.\nwhat you noticed:\n${observed}`,
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
    let trimmed = text.trim();
    if (!trimmed) return;
    // delivery annotations: stripped from speech, kept for the voice era
    const delivery: string[] = [];
    trimmed = trimmed
      .replace(/\[(dry|soft|warm|slow|quiet|pause-before|pause-after)\]/gi, (_, tag: string) => {
        delivery.push(tag.toLowerCase());
        return '';
      })
      .replace(/[^\S\n]{2,}/g, ' ') // collapse spaces, PRESERVE the naming's line breaks
      .trim();
    if (!trimmed) return;
    this.scroll.push({
      kind: 'beat',
      speaker: 'oracle',
      text: trimmed,
      t: Date.now(),
      beatType,
      fam: this.familiarity().level,
      ...(delivery.length > 0 ? { delivery } : {}),
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
    // performed — the drafts stay in the call record for the lab.
    // fossil law applies to free speech too: one retry, then canned.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const line = (await callPersona(this.env, payload)).spoken;
        const fossil = this.fossilOutsideQuotes(line);
        if (!fossil) return line;
        this.note(`free beat spoke a fossil ("${fossil}") — ${attempt === 0 ? 'retrying' : 'canned'}`);
      } catch {
        /* retry, then canned */
      }
    }
    const line = CANNED_LINES[this.cannedIdx % CANNED_LINES.length];
    this.cannedIdx += 1;
    this.lastIntent = this.lastIntent ? { ...this.lastIntent, canned: true } : null;
    return line;
  }

  // ----------------------------------------------------------- cognition

  private maybeFan(force = false): void {
    // the deletion: no interpreter/profiler during investigator intake —
    // the transcript is the profile. post-deal the fan resumes and its
    // first delta catches the whole record up.
    if (this.investigatorIntake()) return;
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
    // post-commit economy: document cycles run every 2nd beat unless forced
    if (!force && dilemmaCommitted(this.dilemma) && beats - this.conjectorSeenBeats < 2) return;
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
    const askMandated = this.classifyMandate && !committed;
    const ask = committed
      ? `document mode. re-read the passages against the newest material and rewrite the ONE that most needs it${questWanted ? ' — the quest passage is unlocked; draft or sharpen it (2 sentences maximum, a small observable experiment)' : ''}. include ONLY what you rewrite; re-emitting an unchanged passage is a wasted cycle.`
      : `${askMandated ? 'MANDATE: your last guess ran HOT — the territory is confirmed. stop hunting. CLASSIFY this cycle. ' : ''}hunting mode (${this.guessCount} guesses so far; at 5, stop hunting — commit your best read or leave it unnamed). grade your previous guess off the reaction; two warms in one territory = commit; a HOT means classify NOW — more hunting after a hot is time stolen from the cards. then file the next guess — or CLASSIFY: emit class (FORK|THRESHOLD|LOOP|WEIGHT) + problem_md + options_md + focus (the dilemma in ≤8 plain words, for her consent question) + optionally alt_focus (a second territory) and plant (one deck card id, hyphenated like five-of-cups or the-tower).`;
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
        prevGuess:
          (this.pendingGuess
            ? `"${this.pendingGuess}" ${this.guessPlayed ? '(played to the visitor)' : '(NOT yet played — grade unplayed unless the room answered it anyway)'}`
            : '(none yet)') +
          (this.lastPlayedGuess && this.lastPlayedGuess !== this.pendingGuess
            ? ` | the guess actually PLAYED last: "${this.lastPlayedGuess}" — grade THAT one off the reaction`
            : '') +
          (this.focusRejections.length > 0
            ? ` | DECLINED FOCUSES (grade these territories cold): ${this.focusRejections.map((f) => `"${f}"`).join('; ')}`
            : ''),
        dilemma: renderDilemma(this.dilemma),
        ask,
      });
      if (out.prev) {
        this.note(`conjector graded previous guess: ${out.prev}`);
        this.lastGuessGrade = out.prev;
        this.lastPlayedGuess = null; // attributed; one cycle of use
        if (out.prev === 'warm' || out.prev === 'hot') this.warmGuessSeen = true;
        if (out.prev === 'hot' && !out.class && !dilemmaCommitted(this.dilemma)) {
          this.classifyMandate = true;
          this.note('HOT without classify — commit mandate armed');
        }
      }
      if (out.class) this.classifyMandate = false;
      // length is a ballpark, never enforced (jake, 2026-08-05): the old
      // refile loop burned two calls, returned the same words, and could
      // drop a live guess entirely. log the overrun; play it anyway.
      if (out.guess && countWords(out.guess) > 28) {
        this.note(`guess ran ${countWords(out.guess)} words (ballpark ~25) — playing it anyway`);
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
      const dup = (a?: string, b?: string) => {
        if (!a || !b) return false;
        const norm = (t: string) => new Set(t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean));
        const A = norm(a);
        const B = norm(b);
        const inter = [...A].filter((w) => B.has(w)).length;
        return inter / Math.max(1, Math.max(A.size, B.size)) >= 0.9;
      };
      if (out.problem_md && dup(out.problem_md, this.dilemma.problem_md)) {
        this.duplicatePassages += 1;
        this.note(`duplicate problem_md dropped (${this.duplicatePassages} total) — edited means edited`);
        out.problem_md = undefined;
      }
      if (out.options_md && dup(out.options_md, this.dilemma.options_md)) {
        this.duplicatePassages += 1;
        this.note(`duplicate options_md dropped (${this.duplicatePassages} total) — edited means edited`);
        out.options_md = undefined;
      }
      if (out.quest_md && dup(out.quest_md, this.dilemma.quest_md)) {
        this.duplicatePassages += 1;
        out.quest_md = undefined;
      }
      if (out.focus) this.focusPhrase = out.focus;
      if (out.alt_focus) this.altFocus = out.alt_focus;
      if (out.guess) this.guessCount += 1;
      if (out.plant) this.plantId = out.plant;
      if (out.problem_md) this.dilemma.problem_md = out.problem_md;
      if (out.options_md) this.dilemma.options_md = out.options_md;
      if (out.quest_md) this.dilemma.quest_md = out.quest_md;
      // thermometer, not a gate: the passages get spoken at the naming
      for (const [k, v] of [['problem_md', out.problem_md], ['options_md', out.options_md]] as const) {
        if (v && countWords(v) > 85) this.note(`${k} ran ${countWords(v)} words (ballpark 70) — spoken length watch`);
      }
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

  private lastVisitorText(): string {
    for (let i = this.scroll.length - 1; i >= 0; i--) {
      const e = this.scroll[i];
      if (e.kind === 'beat' && e.speaker === 'visitor') return e.text;
    }
    return '';
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
          `the read = position job × card charge × dilemma state. one image. it ends with a rotating handle the house supplies to the persona.`,
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
      economy: `free beats get roughly ${capN} words this turn (ballpark) | visitor talk-share ${this.ratio().toFixed(2)} | carry ${this.carry()}${bankedNote}`,
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

  private nextHandle(): string {
    if (this.handleOrder.length === 0) {
      this.handleOrder = BEATS.handles.map((_, i) => i).sort(() => Math.random() - 0.5);
    }
    const h = BEATS.handles[this.handleOrder[this.handleIdx % this.handleOrder.length]];
    this.handleIdx += 1;
    return h;
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
      lines.push(`plain beats poetic: say what the card sees in them straight; lean on the imagery only if it lands harder than the plain sentence. at most one image. end with a handle, in your own words — this round's: "${this.nextHandle()}"`);
    }
    if (intent.ammo) lines.push(`ammo, their UNSAID inner voice — never present it as their words: "${intent.ammo}"`);
    // ballpark, never a count (jake, 2026-08-05): round UP to the
    // nearest 5 and phrase it soft — the number shapes, it doesn't gate
    const words =
      Math.ceil(
        Math.max(
          5,
          intent.beat === 'tissue'
            ? Math.min(intent.approx_words, this.c.TISSUE_CAP)
            : intent.beat === 'read' || intent.beat === 'honor'
              ? Math.max(Math.min(intent.approx_words, this.c.CAP_MAX), 24)
              : Math.min(intent.approx_words, capN),
        ) / 5,
      ) * 5;
    lines.push(
      intent.beat === 'tissue'
        ? `size: roughly under ${words} words — a ballpark, not a count. two words can still be enough when the moment is full.`
        : `size: roughly ${words} words, give or take a breath — a ballpark, not a count. take the room the moment needs.`,
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
  // unbalanced transport quote at a boundary ('hey. pull up a chair."')
  // — legit quoted spans come in pairs, so an odd count ending or
  // starting the line is the model's wrapper, not content
  const dq = (s.match(/["”“]/g) ?? []).length;
  if (dq % 2 === 1) {
    if (/["”]$/.test(s)) s = s.slice(0, -1).trim();
    else if (/^["“]/.test(s)) s = s.slice(1).trim();
  }
  return s;
}
