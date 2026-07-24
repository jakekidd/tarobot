// OracleEngine — the baseline reading loop. One frozen Brief in, the Scroll
// as the only live state, two calls per beat: director (clinical, decides)
// then voice (in character, performs). The membrane holds structurally: the
// director's output is intent, never wording; the voice never sees the
// brief's analysis, only the Set and the recent exchanges.
//
// The word economy is enforced in the loop, not asked for in a prompt:
// the budget fills sub-linearly as the visitor talks (FILL_K * ln(1+words)),
// ticks up slowly through silence, and empties by the oracle's own word count.
//
// Node-portable: no DOM, no timers. The silence clock belongs to the caller
// (the beta UI ticks silenceTick(); a CLI runner would own its own timer).

import type { LLMAdapter } from '../llm/adapter';
import { DIRECTOR_SYSTEM, DIRECT_TOOL, VOICE_SYSTEM } from './prompts';
import { DirectorSetSchema } from './schemas';
import {
  countWords,
  ORACLE_CONSTANTS,
  type AwaitingLayer,
  type Beat,
  type DirectorSet,
  type OracleBrief,
  type OracleConstants,
  type OracleEvent,
  type OracleMode,
  type OraclePhase,
  type OracleSnapshot,
  type ScrollEntry,
} from './types';

type Listener = (snap: OracleSnapshot) => void;

export class OracleEngine {
  private readonly adapter: LLMAdapter;
  readonly brief: OracleBrief;
  readonly mode: OracleMode;
  private readonly c: OracleConstants;

  private phase: OraclePhase = 'idle';
  private scroll: ScrollEntry[] = [];
  private budget: number;
  private flipped: number[] = [];
  private busy: AwaitingLayer = null;
  private lastSet: DirectorSet | null = null;
  private error: string | null = null;

  // Interrupt semantics without cancellable HTTP: every dispatch takes a
  // generation; a newer event bumps it, and stale results are discarded
  // instead of spoken. The visitor talking over an in-flight beat kills
  // that beat, which is the spec's interrupt rule in async form.
  private gen = 0;

  private listeners = new Set<Listener>();

  constructor(args: {
    adapter: LLMAdapter;
    brief: OracleBrief;
    mode: OracleMode;
    constants?: Partial<OracleConstants>;
  }) {
    this.adapter = args.adapter;
    this.brief = args.brief;
    this.mode = args.mode;
    this.c = { ...ORACLE_CONSTANTS, ...args.constants };
    this.budget = this.c.START_BUDGET;
  }

  snapshot(): OracleSnapshot {
    return {
      mode: this.mode,
      phase: this.phase,
      scroll: this.scroll.slice(),
      budget: this.budget,
      flipped: this.flipped.slice(),
      busy: this.busy,
      lastSet: this.lastSet,
      error: this.error,
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

  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'live';
    this.speak(this.brief.opening);
    this.emit();
  }

  visitorLine(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.phase !== 'live') return;
    this.budget = Math.min(
      this.c.WORD_MAX,
      this.budget + Math.round(this.c.FILL_K * Math.log(1 + countWords(trimmed))),
    );
    this.scroll.push({ kind: 'beat', speaker: 'visitor', text: trimmed, t: Date.now() });
    void this.dispatch({ type: 'visitor_line' });
  }

  flip(slot: number): void {
    if (this.phase !== 'live' || this.mode !== 'session') return;
    const card = this.brief.cards.find((c) => c.slot === slot);
    if (!card || this.flipped.includes(slot)) return;
    this.flipped.push(slot);
    void this.dispatch({
      type: 'card_flip',
      slot,
      flip_number: this.flipped.length,
      guide: card.guide,
    });
  }

  /** caller-owned clock. no-op while a beat is in flight, so a slow model
   *  never stacks silence events behind itself. */
  silenceTick(): void {
    if (this.phase !== 'live' || this.busy !== null) return;
    this.budget = Math.min(this.c.WORD_MAX, this.budget + this.c.SILENCE_FILL);
    void this.dispatch({ type: 'silence' });
  }

  private cap(): number {
    const round5 = Math.round(this.budget / 5) * 5;
    return Math.min(this.c.CAP_MAX, Math.max(this.c.CAP_MIN, round5));
  }

  private speak(text: string): void {
    this.scroll.push({ kind: 'beat', speaker: 'oracle', text, t: Date.now() });
    this.budget = Math.max(0, this.budget - countWords(text));
  }

  private async dispatch(event: OracleEvent): Promise<void> {
    const myGen = ++this.gen;
    this.busy = 'director';
    this.error = null;
    this.emit();
    try {
      const set = await this.adapter.invoke(
        {
          system: DIRECTOR_SYSTEM,
          user: JSON.stringify(this.directorPayload(event), null, 2),
          tool: DIRECT_TOOL,
          model: 'cognition',
          max_tokens: 700,
        },
        DirectorSetSchema,
      );
      if (myGen !== this.gen) return;

      this.lastSet = set;
      this.scroll.push({ kind: 'note', text: set.note, t: Date.now() });
      if (set.move === 'hold') return;

      this.busy = 'voice';
      this.emit();
      const line = await this.adapter.invokeFreeform({
        system: VOICE_SYSTEM,
        user: JSON.stringify(this.voicePayload(set), null, 2),
        model: 'cognition',
        max_tokens: 400,
        label: 'oracle_voice',
      });
      if (myGen !== this.gen) return;

      this.speak(sanitizeLine(line));
      if (set.move === 'close') this.phase = 'closed';
    } catch (e) {
      if (myGen === this.gen) {
        this.error = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (myGen === this.gen) {
        this.busy = null;
        this.emit();
      }
    }
  }

  private directorPayload(event: OracleEvent): Record<string, unknown> {
    const b = this.brief;
    return {
      MODE: this.mode,
      BRIEF: {
        name: b.name,
        companion: b.companion,
        portrait: b.portrait,
        fork: b.fork,
        leads: b.leads,
        mantra: b.mantra,
        // Face-down cards stay face-down for the director too — the guide
        // rides in on the flip event. Keeping the constraint costs nothing
        // and stops the arc from foreshadowing cards the visitor hasn't
        // chosen yet.
        cards: b.cards.map((c) =>
          this.flipped.includes(c.slot)
            ? { slot: c.slot, guide: c.guide }
            : { slot: c.slot, face_down: true },
        ),
      },
      TABOOS: b.taboos,
      SCROLL: renderScroll(this.scroll),
      EVENT: describeEvent(event),
      BUDGET: this.budget,
      CAP: this.cap(),
    };
  }

  private voicePayload(set: DirectorSet): Record<string, unknown> {
    const recent = this.scroll
      .filter((e): e is Beat => e.kind === 'beat')
      .slice(-6)
      .map((bt) => `${bt.speaker}: ${bt.text}`);
    return {
      SET: {
        move: set.move,
        intent: set.intent,
        approx_words: Math.min(set.approx_words, this.cap()),
      },
      MANTRA: set.move === 'close' && this.brief.mantra ? this.brief.mantra : undefined,
      visitor_name: this.brief.name,
      recent_exchanges: recent,
    };
  }
}

function renderScroll(scroll: readonly ScrollEntry[]): string {
  return scroll
    .map((e) => (e.kind === 'beat' ? `${e.speaker}: ${e.text}` : `  > ${e.text}`))
    .join('\n');
}

function describeEvent(event: OracleEvent): Record<string, unknown> {
  switch (event.type) {
    case 'visitor_line':
      return { type: 'visitor_line', detail: 'the visitor just spoke; their line is the last beat of the scroll.' };
    case 'card_flip':
      return {
        type: 'card_flip',
        flip_number: event.flip_number,
        slot: event.slot,
        guide: event.guide,
      };
    case 'silence':
      return { type: 'silence', detail: 'the visitor has let the silence run.' };
  }
}

/** models sometimes wrap the line in quotes or prepend a speaker tag —
 *  strip transport artifacts, never rewrite content. */
function sanitizeLine(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^(oracle|seer):\s*/i, '');
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith('“') && s.endsWith('”'))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
