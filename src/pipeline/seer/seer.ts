// Reading engine — orchestrates fan-out cognition + persona, exposes a
// state machine the UI subscribes to.
//
// Architecture (replaces the older Plan-and-Write single-shot):
//
//   start() →
//     intro (preferred OR generated) +
//     round-1 fan-out (4 parallel cognition→persona threads, one per
//     face-down slot, each treating its slot as the hypothetical-next-
//     flip and seeing no other faces)
//
//   user picks slot S in round N →
//     CSS flip animation plays for FLIP_ANIM_MS, then we look up
//     monologueCache[round=N][slot=S]:
//       - hit  → phase = 'beat'
//       - miss → phase = 'beat_pending' (still computing); resolve as the
//                slot's promise lands.
//     After the beat is delivered and user advances, kick off round-(N+1)
//     fan-out (3, 2, 1 threads respectively) AND, if last beat, run the
//     closing cognition+persona pair.
//
//   user submits chat in 'awaiting_flip' or 'done' →
//     chat_pending → persona reply → back to entry phase.
//
// The 'awaiting_tier' field tells the UI which kind of latency to mask
// (cognition stall vs persona stall) so eventually-local-OSS-LLM costs
// are visually distinguishable today.

import type { LLMAdapter } from '../llm/adapter';
import type { DrawnCards, Profile } from '../types';
import type { PickEvent } from '../survey';
import { cognitionPerCard, cognitionClosing, cognitionIntro } from './agents/cognition';
import {
  personaPerCard,
  personaIntro,
  personaClosing,
  personaChat,
} from './agents/persona';
import type {
  ChatMessage,
  Outcome,
  Set,
  Monologue,
  NarrativeRole,
  ReadingListener,
  ReadingPhase,
  ReadingState,
  RevealedSlot,
} from './types';
import { sanitizeMonologue } from './sanitize';

/** What Seer needs to inhabit the table. profile is the deterministic
 *  survey-derived identity record; surveyHistory + intention are the
 *  case file the seer reads before speaking. drawn is the spread the
 *  reading will use. outcomes are the Augur-produced pictures of what
 *  the intention opens onto — passed into all cognition calls (per-
 *  card, closing, intro) but NOT into persona (persona only sees the
 *  Set cognition builds, which already embeds the relevant specifics).
 *  preferred_intro short-circuits intro generation for the demo path. */
export type SeerOpts = {
  adapter: LLMAdapter;
  profile: Profile;
  surveyHistory: PickEvent[];
  intention: string;
  drawn: DrawnCards;
  outcomes: Outcome[];
  preferred_intro?: Monologue;
};

type SlotResult = { set: Set; monologue: Monologue };

const ROUND_TO_ROLE: Record<number, NarrativeRole> = {
  1: 'opening',
  2: 'rising',
  3: 'turning',
  4: 'closing',
};

export class Seer {
  private state: ReadingState;
  private adapter: LLMAdapter;
  private listeners = new Set<ReadingListener>();
  private intention: string;
  private surveyHistory: PickEvent[];
  private outcomes: Outcome[];

  /** key = `${round}:${position_id}` → eventual SlotResult */
  private slotPromises = new Map<string, Promise<SlotResult>>();
  /** key = `${round}:${position_id}` → resolved SlotResult (sync cache) */
  private slotResults = new Map<string, SlotResult>();
  /** Phase to return to after a chat round completes. */
  private phaseBeforeChat: ReadingPhase | null = null;

  /** Resolves when the intro is fully built (cognition → persona → spoken).
   *  UI gates the [ENTER] button on this. */
  public readonly ready: Promise<void>;

  constructor(opts: SeerOpts) {
    this.adapter = opts.adapter;
    this.intention = opts.intention;
    this.surveyHistory = opts.surveyHistory;
    this.outcomes = opts.outcomes;
    this.state = {
      inputs: {
        profile: opts.profile,
        // Filled by cognitionIntro (or '<demo>' for preferred_intro path).
        prose_brief: '',
        drawn: opts.drawn,
        ...(opts.preferred_intro ? { preferred_intro: opts.preferred_intro } : {}),
      },
      phase: 'idle',
      intro: null,
      outro: null,
      revealed: [],
      current_slot: null,
      awaiting_tier: null,
      active_prompt_to_user: null,
      chat: [],
    };
    // Kick off intro generation. Stores result in state.intro; UI waits.
    this.ready = this.buildIntro();
  }

  /** Build the intro via serial cognition → persona. Called once by
   *  the constructor. Stores the prose_brief on state.inputs so all
   *  subsequent per-card cognition calls can reuse it. */
  private async buildIntro(): Promise<void> {
    const preferred = this.state.inputs.preferred_intro;
    if (preferred) {
      this.state.inputs.prose_brief = '<demo fixture>';
      this.setState({
        phase: 'intro',
        intro: sanitizeMonologue(preferred),
        awaiting_tier: null,
      });
      return;
    }

    this.setState({ phase: 'thinking', awaiting_tier: 'cognition' });
    try {
      // STAGE 1: cognition — produce the clinical brief / guide.
      const brief = await cognitionIntro(this.adapter, {
        profile: this.state.inputs.profile,
        intention: this.intention,
        surveyHistory: this.surveyHistory,
        outcomes: this.outcomes,
      });
      // Mutate inputs in place — all per-card/closing cognition calls
      // downstream read this field.
      this.state.inputs.prose_brief = brief;

      // STAGE 2: persona — turn the brief into the spoken intro.
      this.setState({ phase: 'thinking', awaiting_tier: 'persona' });
      const intro = await personaIntro(this.adapter, {
        profile: this.state.inputs.profile,
        prose_brief: brief,
      });
      this.setState({ phase: 'intro', intro, awaiting_tier: null });
    } catch (err) {
      this.setState({
        phase: 'error',
        awaiting_tier: null,
        error: err instanceof Error ? err.message : 'intro generation failed',
      });
    }
  }

  getState(): ReadingState {
    return this.state;
  }

  /** The legacy Profile snapshot the Seer was built from. Reused by
   *  App.tsx to populate the Session row for resume UI. */
  getProfile(): Profile {
    return this.state.inputs.profile;
  }

  /** The user's chosen intention (the question they brought to the
   *  oracle). Available for the reading UI's debug overlay. */
  getIntention(): string {
    return this.intention;
  }

  /** The Augur-seeded outcomes for this session. Read by cognition;
   *  not exposed to persona. Mutable in the future (chat-cognition
   *  pass may refine them mid-session). */
  getOutcomes(): Outcome[] {
    return this.outcomes;
  }

  subscribe(listener: ReadingListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Called by Reading screen on mount (after user clicks [ENTER]).
   *  Spawns round-1 fan-out so card-stories are speculatively built
   *  while the user reads the intro. The intro itself was already
   *  built in the constructor — UI gated entry on `ready`. */
  enter(): void {
    this.spawnFanOut(1, []);
  }

  /** Called by UI after the intro typewriter completes AND user taps. */
  advanceFromIntro(): void {
    if (this.state.phase !== 'intro') return;
    this.setState({
      phase: 'awaiting_flip',
      awaiting_tier: null,
      active_prompt_to_user: promptOrNull(this.state.intro),
    });
  }

  /** User picks a face-down card to flip. Engine handles the rest. */
  pickSlot(slot: string): void {
    if (this.state.phase !== 'awaiting_flip') return;
    if (this.state.revealed.some((r) => r.position_id === slot)) return;
    this.setState({
      phase: 'flipping',
      current_slot: slot,
      active_prompt_to_user: null,
    });
    // After the flip animation finishes, advance to beat (or beat_pending).
    // The UI calls advanceFromFlip() when its CSS transition fires.
  }

  /** Called by UI after the CSS card-flip animation completes. */
  advanceFromFlip(): void {
    if (this.state.phase !== 'flipping') return;
    const slot = this.state.current_slot;
    if (!slot) return;
    const round = this.state.revealed.length + 1;
    const key = roundKey(round, slot);
    const cached = this.slotResults.get(key);
    if (cached) {
      this.setState({ phase: 'beat', awaiting_tier: null });
      return;
    }
    // Not ready yet — show stall and await the slot's promise.
    this.setState({ phase: 'beat_pending', awaiting_tier: 'persona' });
    const pending = this.slotPromises.get(key);
    if (!pending) {
      // Defensive — spawn it now if somehow missing.
      this.spawnFanOut(round, this.state.revealed);
      const retry = this.slotPromises.get(key);
      if (retry) {
        retry
          .then(() => this.setState({ phase: 'beat', awaiting_tier: null }))
          .catch((err) => this.setState({
            phase: 'error',
            awaiting_tier: null,
            error: err instanceof Error ? err.message : 'fan-out failed',
          }));
      }
      return;
    }
    pending
      .then(() => this.setState({ phase: 'beat', awaiting_tier: null }))
      .catch((err) => this.setState({
        phase: 'error',
        awaiting_tier: null,
        error: err instanceof Error ? err.message : 'fan-out failed',
      }));
  }

  /** Called by UI when the beat typewriter completes AND user taps to continue. */
  advanceFromBeat(): void {
    if (this.state.phase !== 'beat') return;
    const slot = this.state.current_slot;
    if (!slot) return;
    const round = this.state.revealed.length + 1;
    const key = roundKey(round, slot);
    const result = this.slotResults.get(key);
    if (!result) return;

    const drawn = this.state.inputs.drawn.cards.find((dc) => dc.position.id === slot);
    if (!drawn) return;

    const revealed: RevealedSlot = {
      position_id: slot,
      card_id: drawn.card.id,
      set: result.set,
      monologue: result.monologue,
    };
    const nextRevealed = [...this.state.revealed, revealed];

    if (nextRevealed.length >= this.state.inputs.drawn.cards.length) {
      // Last flip — run closing.
      this.setState({
        revealed: nextRevealed,
        current_slot: null,
        phase: 'closing_thinking',
        awaiting_tier: 'cognition',
        active_prompt_to_user: null,
      });
      void this.runClosing(nextRevealed);
      return;
    }

    // Otherwise: back to awaiting_flip and spawn round-(N+1) fan-out.
    this.setState({
      revealed: nextRevealed,
      current_slot: null,
      phase: 'awaiting_flip',
      awaiting_tier: null,
      active_prompt_to_user: promptOrNull(result.monologue),
    });
    this.spawnFanOut(nextRevealed.length + 1, nextRevealed);
  }

  /** Called by UI after the outro typewriter completes AND user taps. */
  advanceFromOutro(): void {
    if (this.state.phase !== 'outro') return;
    this.setState({
      phase: 'done',
      awaiting_tier: null,
      active_prompt_to_user: promptOrNull(this.state.outro),
    });
  }

  /** Submit a chat message. Allowed only in awaiting_flip or done. */
  async submitChat(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (this.state.phase !== 'awaiting_flip' && this.state.phase !== 'done') {
      return;
    }
    this.phaseBeforeChat = this.state.phase;
    const priorChat = this.state.chat;
    const userMsg: ChatMessage = { speaker: 'user', text: trimmed };
    this.setState({
      chat: [...priorChat, userMsg],
      phase: 'chat_pending',
      awaiting_tier: 'persona',
      active_prompt_to_user: null,
    });

    try {
      const reply = await personaChat(this.adapter, {
        profile: this.state.inputs.profile,
        prose_brief: this.state.inputs.prose_brief,
        revealed: this.state.revealed,
        chat_history: priorChat,
        user_message: trimmed,
      });
      const seerMsg: ChatMessage = {
        speaker: 'seer',
        text: reply.text,
      };
      this.setState({
        chat: [...this.state.chat, seerMsg],
        phase: this.phaseBeforeChat ?? 'awaiting_flip',
        awaiting_tier: null,
        active_prompt_to_user: promptOrNull(reply),
      });
      this.phaseBeforeChat = null;
    } catch {
      // In-character fallback so the user gets a response instead of dead
      // air. The thrown error is not surfaced — the reading should
      // continue.
      const fallback: ChatMessage = {
        speaker: 'seer',
        text: 'the cards did not speak just then. ask again.',
      };
      this.setState({
        chat: [...this.state.chat, fallback],
        phase: this.phaseBeforeChat ?? 'awaiting_flip',
        awaiting_tier: null,
      });
      this.phaseBeforeChat = null;
    }
  }

  /** Convenience for UI: is sending a chat message currently allowed? */
  canSendChat(): boolean {
    return this.state.phase === 'awaiting_flip' || this.state.phase === 'done';
  }

  /** The monologue currently being delivered (intro/beat/outro). */
  getCurrentMonologue(): Monologue | null {
    const { phase, intro, outro, current_slot, revealed } = this.state;
    if (phase === 'intro') return intro;
    if (phase === 'outro') return outro;
    if (phase === 'beat' && current_slot) {
      const round = revealed.length + 1;
      const key = roundKey(round, current_slot);
      const r = this.slotResults.get(key);
      return r?.monologue ?? null;
    }
    return null;
  }

  // ─── internals ──────────────────────────────────────────────

  private spawnFanOut(round: number, revealedSnapshot: RevealedSlot[]): void {
    const revealedIds = new Set(revealedSnapshot.map((r) => r.position_id));
    const all = this.state.inputs.drawn.cards;
    const targets = all.filter((dc) => !revealedIds.has(dc.position.id));

    const revealed_history = revealedSnapshot.map((r) => {
      const dc = all.find((c) => c.position.id === r.position_id);
      return {
        position_id: r.position_id,
        card_name: dc?.card.name ?? '?',
        beat_text: r.monologue.text,
      };
    });
    const all_positions = all.map((dc) => ({
      id: dc.position.id,
      role: dc.position.role,
      prompt_label: dc.position.prompt_label,
    }));
    const chat_snapshot = [...this.state.chat];

    const role: NarrativeRole = ROUND_TO_ROLE[round] ?? 'rising';

    for (const dc of targets) {
      const key = roundKey(round, dc.position.id);
      if (this.slotPromises.has(key)) continue;

      const slotPromise: Promise<SlotResult> = (async () => {
        const rawSet = await cognitionPerCard(this.adapter, {
          profile: this.state.inputs.profile,
          prose_brief: this.state.inputs.prose_brief,
          outcomes: this.outcomes,
          spread_id: this.state.inputs.drawn.spread.id,
          spread_name: this.state.inputs.drawn.spread.name,
          all_positions,
          this_slot: {
            position_id: dc.position.id,
            role: dc.position.role,
            prompt_label: dc.position.prompt_label,
            card_id: dc.card.id,
            card_name: dc.card.name,
            card_keywords: dc.card.keywords,
            card_upright_meaning: dc.card.upright_meaning,
          },
          flip_round: round,
          revealed_history,
          chat_history: chat_snapshot,
        });
        // Belt-and-suspenders: normalize narrative_role + flip_round in
        // case cognition's emission drifted from what the engine knows.
        const set: Set = { ...rawSet, narrative_role: role, flip_round: round };

        const monologue = await personaPerCard(this.adapter, {
          profile: this.state.inputs.profile,
          prose_brief: this.state.inputs.prose_brief,
          set,
          card: {
            name: dc.card.name,
            keywords: dc.card.keywords,
            upright_meaning: dc.card.upright_meaning,
          },
          slot_label: dc.position.prompt_label,
          revealed_history,
          chat_history: chat_snapshot,
        });

        const result: SlotResult = { set, monologue };
        this.slotResults.set(key, result);
        return result;
      })();

      this.slotPromises.set(key, slotPromise);
      // Swallow rejection here — the consumer (advanceFromFlip) attaches
      // its own .catch when it awaits this promise. We don't want an
      // unhandled rejection if no one awaits this slot.
      slotPromise.catch(() => { /* surfaced when picked */ });
    }
  }

  private async runClosing(revealed: RevealedSlot[]): Promise<void> {
    try {
      const closing = await cognitionClosing(this.adapter, {
        profile: this.state.inputs.profile,
        prose_brief: this.state.inputs.prose_brief,
        outcomes: this.outcomes,
        revealed,
        chat_history: this.state.chat,
      });
      this.setState({ awaiting_tier: 'persona' });
      const outro = await personaClosing(this.adapter, {
        profile: this.state.inputs.profile,
        prose_brief: this.state.inputs.prose_brief,
        revealed,
        chat_history: this.state.chat,
        closing,
      });
      this.setState({ phase: 'outro', outro, awaiting_tier: null });
    } catch (err) {
      this.setState({
        phase: 'error',
        awaiting_tier: null,
        error: err instanceof Error ? err.message : 'closing failed',
      });
    }
  }

  private setState(partial: Partial<ReadingState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) {
      try { fn(this.state); } catch { /* swallow */ }
    }
  }
}

function roundKey(round: number, slot: string): string {
  return `${round}:${slot}`;
}

function promptOrNull(m: Monologue | null): string | null {
  const p = m?.prompt_to_user?.trim();
  return p && p.length > 0 ? p : null;
}

export type { ReadingPhase };
