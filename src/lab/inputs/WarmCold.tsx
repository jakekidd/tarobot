// Bench input — WarmCold.
// Two large equal targets for assertion responses, plus an optional
// correction input that appears after the primary pick. Wire format
// matches the engine's parseAssertionAnswer:
//   'warm' | 'cold' | 'warm:<correction>' | 'cold:<correction>'

import { useState, type FormEvent } from 'react';
import { Button } from '../lib';

type Props = {
  onPick: (value: string) => void;
};

type Phase = 'primary' | 'follow-up';
type Direction = 'warm' | 'cold' | null;

export function WarmCold({ onPick }: Props) {
  const [phase, setPhase] = useState<Phase>('primary');
  const [direction, setDirection] = useState<Direction>(null);
  const [correction, setCorrection] = useState('');

  function pickPrimary(d: 'warm' | 'cold') {
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
      <div className="bench__wc">
        <button
          type="button"
          className="bench__wc-btn bench__wc-btn--cold"
          onClick={() => pickPrimary('cold')}
        >
          cold
        </button>
        <button
          type="button"
          className="bench__wc-btn bench__wc-btn--warm"
          onClick={() => pickPrimary('warm')}
        >
          warm
        </button>
      </div>
    );
  }

  return (
    <form className="bench__stack bench__stack--gap-3" onSubmit={submitFinal}>
      <div className={`bench__field-label`}>
        {direction === 'warm' ? "what's closer to true?" : "what's actually true?"}
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
        <Button onClick={() => submitFinal()} variant="primary" disabled={correction.trim().length === 0}>
          submit
        </Button>
      </div>
    </form>
  );
}
