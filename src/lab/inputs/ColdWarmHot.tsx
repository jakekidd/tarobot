// Bench input — ColdWarmHot.
//
// Three equal targets for assertion responses: COLD (wrong
// neighbourhood; eliminate), WARM (right neighbourhood; refine),
// HOT (dead on; you've struck a live wire). Plus an optional
// correction text field that appears after the primary pick.
//
// HOT measures CHARGE, not truth. A statement can be perfectly
// accurate and still cold if it isn't where the charge is. Resist
// the urge to map this to a yes/no axis.
//
// Wire format matches the engine's parseAssertionAnswer:
//   'cold' | 'warm' | 'hot' | 'cold:<text>' | 'warm:<text>' | 'hot:<text>'

import { useState, type FormEvent } from 'react';
import { Button } from '../lib';

type Props = {
  onPick: (value: string) => void;
};

type Phase = 'primary' | 'follow-up';
type Direction = 'cold' | 'warm' | 'hot';

export function ColdWarmHot({ onPick }: Props) {
  const [phase, setPhase] = useState<Phase>('primary');
  const [direction, setDirection] = useState<Direction | null>(null);
  const [correction, setCorrection] = useState('');

  function pickPrimary(d: Direction) {
    setDirection(d);
    setPhase('follow-up');
  }

  function submitFinal(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!direction) return;
    const trimmed = correction.trim();
    onPick(trimmed ? `${direction}:${trimmed}` : direction);
  }

  if (phase === 'primary') {
    return (
      <div className="bench__cwh">
        <button
          type="button"
          className="bench__cwh-btn bench__cwh-btn--cold"
          onClick={() => pickPrimary('cold')}
        >
          cold
        </button>
        <button
          type="button"
          className="bench__cwh-btn bench__cwh-btn--warm"
          onClick={() => pickPrimary('warm')}
        >
          warm
        </button>
        <button
          type="button"
          className="bench__cwh-btn bench__cwh-btn--hot"
          onClick={() => pickPrimary('hot')}
        >
          hot
        </button>
      </div>
    );
  }

  const promptText =
    direction === 'hot'
      ? 'in your own words?'
      : direction === 'warm'
      ? "what's closer to true?"
      : "what's actually true?";

  return (
    <form className="bench__stack bench__stack--gap-3" onSubmit={submitFinal}>
      <div className="bench__field-label">
        {promptText}
        <span className="bench__text-faint" style={{ marginLeft: 8, fontWeight: 400 }}>
          (optional)
        </span>
      </div>
      <input
        type="text"
        className="bench__input"
        value={correction}
        onChange={(e) => setCorrection(e.target.value)}
        placeholder="say more, or leave blank"
        autoFocus
      />
      <div className="bench__row bench__row--gap-2 bench__row--end">
        <Button onClick={() => submitFinal()} variant="ghost">nothing to add</Button>
        <Button
          onClick={() => submitFinal()}
          variant="primary"
          disabled={correction.trim().length === 0}
        >
          submit
        </Button>
      </div>
    </form>
  );
}
