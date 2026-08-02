// EnsembleEngine — the live loop per ENSEMBLE-PLAN.md §4.
//
// BEHAVIOR is exactly two blocking calls per beat: driver decides,
// persona performs. COGNITION is the fan (six agents in parallel, one in
// flight, one pending, coalesced) plus attention regenerating the frame
// on its own triggers. The membrane holds by topology: the persona never
// sees reads, thoughts, questions, facts, or predictions — only the
// frame, the intent, and the joker's bit.
//
// Node-portable: no DOM, no timers. The silence clock belongs to the
// caller. Interrupt semantics are generation bumps: a newer event makes
// in-flight results stale, and stale results are discarded, not spoken.

import type { LLMAdapter } from '../llm/adapter';
import { deckCard } from '../oracle/deck';
import {
  callAttention,
  callBeholder,
  callDriver,
  callInterpreter,
  callPersona,
  DEFAULT_TIERS,
  fmtFact,
  fmtRead,
  renderDocs,
  renderTail,
  type AgentEnv,
} from './agents';
import { cap, carryFromScroll, fillFromLine, fillFromSilence, spend, talkRatio } from './economy';
import { FrameStore, frameV1 } from './frame';
import { renderGreeting } from './greeting';
import { Piles } from './piles';
import { deriveStage, stageGoals } from './stages';
import { pickStallKind, STALL_GUIDANCE } from './stall';
import {
  countWords,
  ENSEMBLE_CONSTANTS,
  type AgentName,
  type Anchor,
  type Beat,
  type BusyLayer,
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
  type StallDebt,
} from './types';

type Listener = (snap: EnsembleSnapshot) => void;

const CANNED_LINES = ['mm. go on.', 'say more about that.', 'hm. one moment.', 'i am listening.'];

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

  private budget: number;
  private flipped: number[] = [];
  private busy: BusyLayer = null;
  private lastIntent: Intent | null = null;
  private error: string | null = null;
  private cannedIdx = 0;

  private stallDebt: StallDebt | null = null;
  private stallConsecutive = 0;
  /** scripted greeting beats don't count as performed turns */
  private greetingBeatCount = 0;

  private gen = 0;

  // fan state
  private fanInFlight = false;
  /** coalesced re-run request; carries force so a stall's fan (which
   *  promises "cognition has weighed in") survives arriving while
   *  another fan is mid-flight */
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

  /** accumulation: interpreter thoughts filed since the driver last
   *  spent one as ammo — past BANKED_THOUGHTS the driver gets nudged */
  private thoughtsSinceAmmo = 0;

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
      piles: this.piles.view(),
      frame: this.frames.current(),
      frames: [...this.frames.history()],
      economy: { budget: this.budget, ratio: this.ratio(), carry: this.carry() },
      flipped: this.flipped.slice(),
      busy: this.busy,
      lastIntent: this.lastIntent,
      stallDebt: this.stallDebt,
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

  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'live';
    this.scroll.push({ kind: 'ev', ev: 'open', t: Date.now() });
    const greeting = this.input.greeting
      ? renderGreeting(this.input.greeting, { name: this.input.brief?.name })
      : [];
    if (greeting.length > 0) {
      // the greeting is screenwritten: spoken verbatim, free of the
      // budget, no model in the loop. the opening is where an unfounded
      // generated line costs the most.
      for (const text of greeting) {
        this.scroll.push({ kind: 'beat', speaker: 'oracle', text, t: Date.now() });
      }
      this.greetingBeatCount = greeting.length;
      this.emit();
      return;
    }
    void this.dispatch({ type: 'open' });
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

  flip(slot: 1 | 2 | 3 | 4): void {
    if (this.phase !== 'live' || this.mode !== 'session' || !this.input.brief) return;
    const card = this.input.brief.cards.find((c) => c.slot === slot);
    if (!card || this.flipped.includes(slot)) return;
    this.flipped.push(slot);
    this.budget = Math.min(this.budget + this.c.FLIP_FILL, this.c.WORD_MAX);
    this.scroll.push({ kind: 'ev', ev: 'flip', slot, t: Date.now() });
    this.lastEventWasFlip = true;
    this.triggerAttention('flip');
    void this.dispatch({
      type: 'card_flip',
      slot,
      flip_number: this.flipped.length,
      guide: card.guide,
    });
  }

  /** caller-owned clock. no-op while a beat is in flight so a slow model
   *  never stacks silence events behind itself. */
  silenceTick(): void {
    if (this.phase !== 'live' || this.busy !== null) return;
    this.budget = fillFromSilence(this.budget, this.c);
    this.scroll.push({ kind: 'ev', ev: 'silence', t: Date.now() });
    void this.dispatch({ type: 'silence' });
  }

  /** the UI's interrupt: the typewriter was cut off mid-render. the beat
   *  stays (it was spoken up to here), truncated and marked. */
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

  // ------------------------------------------------------------ behavior

  private async dispatch(event: EnsembleEvent): Promise<void> {
    const myGen = ++this.gen;
    this.error = null;

    if (this.c.FAN_BLOCKING && event.type === 'visitor_line') {
      await this.runFan();
      if (myGen !== this.gen) return;
    }

    this.busy = 'driver';
    this.emit();
    try {
      const intent = await this.driverWithFallback(event);
      if (myGen !== this.gen) return;

      this.lastIntent = intent;
      this.piles.intents.append('driver', this.anchor(), intent);
      if (intent.ammo) this.thoughtsSinceAmmo = 0;

      let assignmentIntent = intent;
      if (intent.move === 'stall' && event.type !== 'open') {
        const kind = intent.stall_kind ?? pickStallKind(this.c.STALL_WEIGHTS);
        this.stallConsecutive += 1;
        this.stallDebt = {
          accomplish: intent.accomplish,
          kind,
          consecutive: this.stallConsecutive,
        };
        assignmentIntent = { ...intent, stall_kind: kind };
        this.maybeFan(true); // the whole point: cognition catches up under the stall
      } else if (intent.move === 'stall') {
        // stall on open is not a thing; degrade to respond
        assignmentIntent = { ...intent, move: 'respond' };
      }

      if (intent.move === 'hold') {
        this.busy = null;
        this.maybeFan();
        this.emit();
        return;
      }

      this.busy = 'persona';
      this.emit();
      const line = await this.personaWithFallback(assignmentIntent);
      if (myGen !== this.gen) return;

      const clean = sanitizeLine(line);
      if (clean) {
        this.scroll.push({ kind: 'beat', speaker: 'oracle', text: clean, t: Date.now() });
        this.budget = spend(this.budget, clean);
        // turn boundary: an oracle speech commit closes the turn.
        if (this.visitorWordsThisTurn > 0) this.turnsWithMaterialSinceFan += 1;
        this.visitorWordsThisTurn = 0;
        this.turnsSinceFrameRegen += 1;
      }

      if (assignmentIntent.move !== 'stall') {
        this.stallConsecutive = 0;
        this.stallDebt = null;
      }

      if (assignmentIntent.move === 'close') {
        this.scroll.push({ kind: 'ev', ev: 'close', t: Date.now() });
        this.phase = 'closed';
      }

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

  private async driverWithFallback(event: EnsembleEvent): Promise<Intent> {
    const payload = this.driverPayload(event);
    try {
      return await callDriver(this.env, payload);
    } catch {
      try {
        return await callDriver(this.env, payload);
      } catch {
        return {
          move: 'respond',
          thread: 'the room',
          accomplish: 'keep the room warm; one small line',
          approx_words: 12,
          note: 'canned: driver failed twice',
          canned: true,
        };
      }
    }
  }

  private async personaWithFallback(intent: Intent): Promise<string> {
    const payload = {
      conversation: this.renderBeats(Infinity),
      frame: this.frames.current().md,
      assignment: this.assignment(intent),
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

    const [read, facts] = await Promise.allSettled([
      callInterpreter(this.env, {
        conversation,
        frame: frameMd,
        ownTail: renderTail(this.piles.reads.tail(this.c.TAIL_READS), fmtRead),
      }),
      callBeholder(this.env, {
        conversation,
        ownTail: renderTail(this.piles.ledger(), fmtFact),
      }),
    ]);

    let frameStale = false;
    if (read.status === 'fulfilled') {
      this.piles.reads.append('interpreter', anchor, read.value);
      this.thoughtsSinceAmmo += read.value.thoughts.length;
      if (read.value.frame_stale) frameStale = true;
    }
    if (facts.status === 'fulfilled' && facts.value.length > 0) {
      this.piles.mergeFacts('beholder', anchor, facts.value, this.c.LEDGER_CAP);
    }

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
      const brief = this.input.brief;
      const md = await callAttention(this.env, {
        docs: renderDocs(this.input.docs),
        brief: brief
          ? JSON.stringify(
              { name: brief.name, fork: brief.fork, leads: brief.leads, mantra: brief.mantra,
                cards: brief.cards.map((c) => {
                  const flipped = this.flipped.includes(c.slot);
                  const entry = flipped ? deckCard(c.id) : undefined;
                  return {
                    slot: c.slot,
                    flipped,
                    guide: c.guide,
                    // flipped cards bring their full deck-bible entry so
                    // the dressings section has real imagery to hand out
                    ...(entry
                      ? { symbols: entry.symbols, charge: entry.charge, shadow: entry.shadow }
                      : {}),
                  };
                }) },
              null,
              2,
            )
          : '(chat mode: no brief, no cards — omit dressings)',
        taboos: this.taboos().join('; ') || '(none)',
        conversation: this.renderBeats(this.c.BEATS_WINDOW_ATTN),
        piles: [
          `reads:\n${renderTail(this.piles.reads.tail(this.c.TAIL_READS * 2), fmtRead)}`,
          `facts ledger (whole):\n${renderTail(this.piles.ledger(), fmtFact)}`,
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

  private anchor(): Anchor {
    const spoken = this.scroll.filter(
      (e): e is Beat => e.kind === 'beat' && e.speaker === 'oracle',
    ).length;
    // turns are performed beats; the scripted greeting isn't one
    const turn = Math.max(0, spoken - this.greetingBeatCount);
    return { turn, beat: Math.max(0, this.scroll.length - 1) };
  }

  private stage() {
    return deriveStage({
      mode: this.mode,
      scroll: this.scroll,
      flippedCount: this.flipped.length,
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
    return [...(this.input.taboos ?? []), ...(this.input.brief?.taboos ?? [])];
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

  private stallState(event: EnsembleEvent): string {
    if (event.type === 'open') return 'unavailable (the opening)';
    const parts: string[] = [];
    if (this.stallConsecutive >= this.c.STALL_MAX_CONSECUTIVE) {
      parts.push('unavailable: you have stalled enough. move.');
    } else {
      parts.push('available');
      // the condition stall exists for must be VISIBLE to the driver
      // (exp04: with silent staleness, the brake was never chosen once)
      const lastVisitorIdx = this.scroll.reduce(
        (idx, e, i) => (e.kind === 'beat' && e.speaker === 'visitor' ? i : idx),
        -1,
      );
      const lastRead = this.piles.reads.last();
      if (lastVisitorIdx >= 0 && (!lastRead || lastRead.anchor.beat < lastVisitorIdx)) {
        parts.push('note: cognition has NOT digested the newest visitor material yet.');
      }
    }
    if (this.stallDebt) {
      parts.push(
        `DEBT: you bought a beat to "${this.stallDebt.accomplish}" (played as ${this.stallDebt.kind}). cognition has now weighed in. deliver.`,
      );
    }
    return parts.join(' | ');
  }

  private describeEvent(event: EnsembleEvent): string {
    switch (event.type) {
      case 'open':
        return `the opening. scenario: ${this.input.scenario}`;
      case 'visitor_line':
        return 'the visitor just spoke; their line is the last beat of the conversation.';
      case 'card_flip': {
        // the deck bible rides the flip: symbols to dress the read in,
        // the charge as the question the card puts to this person
        const card = this.input.brief?.cards.find((c) => c.slot === event.slot);
        const entry = card ? deckCard(card.id) : undefined;
        const bible = entry
          ? ` | the card's imagery: ${entry.symbols.join('; ')} | its charge: ${entry.charge}`
          : '';
        return `card flip ${event.flip_number} of 4, slot ${event.slot}. its guide: ${event.guide}${bible}`;
      }
      case 'silence':
        return 'the visitor has let the silence run.';
    }
  }

  private driverPayload(event: EnsembleEvent) {
    const brief = this.input.brief;
    const capN = cap(this.budget, this.carry(), this.c);
    // the mantra is the close's payload — showing it to the driver every
    // beat gets it spent early (live-run finding: it leaked on beat two).
    // it appears only when the ending is in reach.
    const closeNear =
      this.mode === 'session' ? this.flipped.length >= 4 : this.anchor().turn >= 4;
    const mantraNote =
      closeNear && brief?.mantra ? ` | mantra on close: ${brief.mantra}` : '';
    // accumulation trigger: banked material should get SPENT, not stored
    const bankedNote =
      this.thoughtsSinceAmmo >= this.c.BANKED_THOUGHTS
        ? ` | banked: ${this.thoughtsSinceAmmo} unspent guesses have piled up — if one is ripe for this moment, spend it as ammo`
        : '';
    return {
      mode: this.mode,
      taboos: this.taboos().join('; ') || '(none)',
      docs: renderDocs(this.input.docs),
      frame: this.frames.current().md,
      conversation: this.renderBeats(this.c.BEATS_WINDOW_DRIVER),
      cognition: `reads, newest last (their "thinking" lines are ammo candidates, the visitor's own inner voice):\n${renderTail(this.piles.reads.tail(this.c.TAIL_READS), fmtRead)}`,
      goals: this.renderGoals(),
      economy: `cap ${capN} words | visitor talk-share ${this.ratio().toFixed(2)} | carry ${this.carry()}${mantraNote}${bankedNote}`,
      stallState: this.stallState(event),
      event: this.describeEvent(event),
    };
  }

  private renderGoals(): string {
    const stage = this.stage();
    const goals = stageGoals(this.mode, stage);
    if (goals.length === 0) return `stage: ${stage} | (no standing goals)`;
    return [`stage: ${stage} — P0 highest`, ...goals].join('\n');
  }

  private assignment(intent: Intent): string {
    const capN = cap(this.budget, this.carry(), this.c);
    const words = Math.min(intent.approx_words, capN);
    const lines: string[] = [];
    if (intent.move === 'stall' && intent.stall_kind) {
      lines.push(`move: stall — ${STALL_GUIDANCE[intent.stall_kind]}`);
      lines.push(`aim: ${intent.accomplish}`);
    } else {
      lines.push(`move: ${intent.move}`);
      lines.push(`accomplish: ${intent.accomplish}`);
    }
    if (intent.ammo) lines.push(`ammo, verbatim if it fits your mouth: "${intent.ammo}"`);
    if (intent.move === 'close' && this.input.brief?.mantra) {
      lines.push(`the mantra, the last thing they hear: ${this.input.brief.mantra}`);
    }
    // the name rides only the first and last beats — handed over every
    // beat, the persona wears it out (live audit: 14/14 oracle beats said
    // "maya"; the run with no name passed said it zero times)
    const isOpening = !this.scroll.some((e) => e.kind === 'beat' && e.speaker === 'oracle');
    if (this.input.brief?.name && (isOpening || intent.move === 'close')) {
      lines.push(`their name, use it sparingly: ${this.input.brief.name}`);
    }
    lines.push(`approximately ${words} words. under is better.`);
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
