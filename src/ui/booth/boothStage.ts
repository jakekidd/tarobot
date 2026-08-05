// The booth's presentation state — pure, node-portable, testable
// headlessly (scripts/booth-smoke.ts). The engine owns the truth; this
// maps snapshots + table clicks into what the 3d scene shows. The one
// theatrical liberty: the engine deals the whole spread at once, but
// the visitor deals it card by card by clicking the deck — the same
// cards, revealed at their pace.

import type { EnsembleEngine } from '../../pipeline/ensemble';
import type { EnsembleSnapshot } from '../../pipeline/ensemble';

export type BoothCard = {
  slot: number;
  position: string;
  dealt: boolean;
  flipped: boolean;
  /** card name, only once flipped */
  name: string | null;
};

export type EyesMood = 'idle' | 'thinking' | 'speaking';

export type BoothView = {
  phase: 'live' | 'closed';
  subtitle: string | null;
  /** bumps every time a new oracle beat lands — the scene pulses on it */
  subtitleSeq: number;
  deckVisible: boolean;
  cardsRemaining: number;
  cards: BoothCard[];
  eyes: EyesMood;
  awaiting: 'visitor' | 'deal' | 'oracle' | 'done';
};

export class BoothStage {
  private dealtCount = 0;
  private lastOracleBeats = 0;
  private seq = 0;
  private subtitleText: string | null = null;
  private readonly engine: EnsembleEngine;

  constructor(engine: EnsembleEngine) {
    this.engine = engine;
  }

  /** the visitor pulls a card off the deck — pure theater, the spread
   *  is already drawn; this reveals the next card at its place */
  clickDeck(): void {
    const snap = this.engine.snapshot();
    if (this.dealtCount < snap.drawn.length) this.dealtCount += 1;
  }

  /** clicking a face-down dealt card flips it (only once the whole
   *  spread is on the table — you finish dealing before you turn) */
  clickCard(slot: number): void {
    const snap = this.engine.snapshot();
    if (this.dealtCount < snap.drawn.length) return;
    if (snap.flipped.includes(slot)) return;
    this.engine.flip(slot);
  }

  view(snap?: EnsembleSnapshot): BoothView {
    const s = snap ?? this.engine.snapshot();
    const oracleBeats = s.scroll.filter(
      (e) => e.kind === 'beat' && e.speaker === 'oracle',
    );
    if (oracleBeats.length > this.lastOracleBeats) {
      // beats that land together (the boot pair, quest+close) show together
      const fresh = oracleBeats.slice(this.lastOracleBeats);
      this.subtitleText = fresh
        .map((b) => (b.kind === 'beat' ? b.text : ''))
        .filter(Boolean)
        .join('\n\n');
      this.lastOracleBeats = oracleBeats.length;
      this.seq += 1;
    }
    const subtitle = this.subtitleText;

    const cards: BoothCard[] = s.drawn.map((d, i) => ({
      slot: d.slot,
      position: d.position,
      dealt: i < this.dealtCount,
      flipped: s.flipped.includes(d.slot),
      name: s.flipped.includes(d.slot) ? d.card.name : null,
    }));

    const eyes: EyesMood =
      s.busy !== null ? 'thinking' : this.seq > 0 ? 'speaking' : 'idle';

    const dealing = s.drawn.length > 0 && this.dealtCount < s.drawn.length;
    const awaiting: BoothView['awaiting'] =
      s.phase === 'closed' ? 'done' : s.busy !== null ? 'oracle' : dealing ? 'deal' : 'visitor';

    return {
      phase: s.phase === 'closed' ? 'closed' : 'live',
      subtitle,
      subtitleSeq: this.seq,
      deckVisible: dealing,
      cardsRemaining: Math.max(0, s.drawn.length - this.dealtCount),
      cards,
      eyes,
      awaiting,
    };
  }
}
