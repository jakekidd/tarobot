// Reading engine — orchestrates the cognition + persona calls and exposes
// a state machine the UI can subscribe to.
//
// Lifecycle:
//   construct(inputs)          → state.phase = 'idle'
//   start()                    → fires cognition, then persona; phase = 'thinking'
//                                while both run. On success, phase = 'intro'.
//   advance()                  → moves through phases:
//                                'intro' → 'flipping' (card 0)
//                                'flipping' → 'beat' (card N) → 'between' →
//                                  'flipping' (card N+1) → ... → 'beat' (last)
//                                → 'outro' → 'done'
//                                The UI calls advance() when the current
//                                phase's animation finishes (or on user tap).
//   subscribe(listener)        → state-change callback.
//
// No mid-reading LLM calls. Latency lives entirely between start() and
// phase='intro'. After that, sequencing is local.

import type { LLMAdapter } from '../survey/adapter';
import { planReading } from './cognition';
import { voiceReading } from './persona';
import type {
  Beat,
  CardAngle,
  Reading,
  ReadingInputs,
  ReadingListener,
  ReadingPhase,
  ReadingPlan,
  ReadingState,
} from './types';

export type ReadingOpts = {
  adapter: LLMAdapter;
  inputs: ReadingInputs;
};

export class ReadingEngine {
  private state: ReadingState;
  private adapter: LLMAdapter;
  private listeners = new Set<ReadingListener>();

  constructor(opts: ReadingOpts) {
    this.adapter = opts.adapter;
    this.state = {
      inputs: opts.inputs,
      plan: null,
      reading: null,
      phase: 'idle',
      current_index: -1,
      revealed_position_ids: [],
      closed: false,
    };
  }

  getState(): ReadingState {
    return this.state;
  }

  /** Kick off cognition + persona. Resolves when persona returns. */
  async start(): Promise<void> {
    if (this.state.phase !== 'idle') return;
    this.setState({ phase: 'thinking' });

    try {
      const plan = await planReading(this.adapter, this.state.inputs);
      this.setState({ plan });

      const reading = await voiceReading(this.adapter, {
        profile: this.state.inputs.profile,
        prose_brief: this.state.inputs.prose_brief,
        drawn: this.state.inputs.drawn,
        plan,
      });

      // Sort beats to match plan's card order (defensive — the model should
      // return them in the same order, but order matters for the UI).
      const orderedBeats = orderBeatsByPlan(reading, plan);
      this.setState({
        reading: { ...reading, beats: orderedBeats },
        phase: 'intro',
      });
    } catch (err) {
      this.setState({
        phase: 'idle',
        error: err instanceof Error ? err.message : 'reading failed',
      });
    }
  }

  /**
   * Advance to the next stage of the reading. Called by the UI after each
   * animation completes (intro typed out → flip → beat typed out → between
   * → next flip → ...).
   */
  advance(): void {
    const { phase, plan, reading, current_index } = this.state;
    if (!plan || !reading) return;

    if (phase === 'intro') {
      // intro just finished → flip the first card
      this.setState({ phase: 'flipping', current_index: 0 });
      return;
    }
    if (phase === 'flipping') {
      // flip done → voice the beat
      this.setState({ phase: 'beat' });
      return;
    }
    if (phase === 'beat') {
      // beat finished. Mark this position revealed.
      const pos = plan.cards[current_index]?.position_id;
      const revealed = pos
        ? [...this.state.revealed_position_ids, pos]
        : this.state.revealed_position_ids;

      const isLast = current_index >= plan.cards.length - 1;
      if (isLast) {
        this.setState({
          revealed_position_ids: revealed,
          phase: reading.outro.trim().length > 0 ? 'outro' : 'done',
          closed: reading.outro.trim().length === 0,
        });
      } else {
        this.setState({
          revealed_position_ids: revealed,
          phase: 'between',
        });
      }
      return;
    }
    if (phase === 'between') {
      // between pause → flip the next card
      this.setState({
        phase: 'flipping',
        current_index: current_index + 1,
      });
      return;
    }
    if (phase === 'outro') {
      this.setState({ phase: 'done', closed: true });
      return;
    }
  }

  /**
   * Get the current beat that should be playing, or null. Convenience for
   * the UI — looks up by current_index from the plan's card order.
   */
  getCurrentBeat(): Beat | null {
    if (!this.state.reading || !this.state.plan) return null;
    const angle = this.state.plan.cards[this.state.current_index];
    if (!angle) return null;
    return this.state.reading.beats.find((b) => b.position_id === angle.position_id) ?? null;
  }

  getCurrentAngle(): CardAngle | null {
    if (!this.state.plan) return null;
    return this.state.plan.cards[this.state.current_index] ?? null;
  }

  subscribe(listener: ReadingListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ─── internals ──────────────────────────────────────

  private setState(partial: Partial<ReadingState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) {
      try { fn(this.state); } catch { /* swallow */ }
    }
  }
}

function orderBeatsByPlan(reading: Reading, plan: ReadingPlan): Beat[] {
  const byPosition = new Map(reading.beats.map((b) => [b.position_id, b]));
  const ordered: Beat[] = [];
  for (const card of plan.cards) {
    const beat = byPosition.get(card.position_id);
    if (beat) ordered.push(beat);
  }
  return ordered;
}

export type { ReadingPhase };
