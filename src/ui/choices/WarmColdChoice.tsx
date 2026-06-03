// WarmColdChoice — UI for diviner-emitted guesses. One screen: the
// COLD / WARM / HOT temperature buttons (a row on desktop, a HOT-to-COLD
// stack on mobile) plus an optional "in your own words?" field beneath.
// Tapping a temperature submits it, carrying any text the user typed.
//
// HOT measures CHARGE, not truth: "that's the one I'd actually ask about."
// A statement can be accurate and still COLD if the charge isn't there.
//
// Wire format submitted via onPick:
//   'cold' | 'warm' | 'hot'                        — temperature, no correction
//   'cold:<text>' | 'warm:<text>' | 'hot:<text>'   — temperature + correction

import { useState } from 'react';
import { fireImpact } from '../scene/impactStore';
import { useChoiceReady } from './useChoiceReady';

type Props = {
  disabled?: boolean;
  onPick: (value: string) => void;
};

const PICK_ANIMATION_MS = 420;
const BEACON_DELAY_MS = 220;

type PickState = 'idle' | 'picked' | 'unpicked';
type Direction = 'cold' | 'warm' | 'hot';

export function WarmColdChoice({ disabled, onPick }: Props) {
  const [picked, setPicked] = useState<Direction | null>(null);
  const [text, setText] = useState('');
  const ready = useChoiceReady();
  const locked = disabled || picked !== null || !ready;

  function submit(dir: Direction, x: number, y: number) {
    if (picked) return;
    setPicked(dir);
    const trimmed = text.trim();
    const value = trimmed ? `${dir}:${trimmed}` : dir;
    window.setTimeout(() => fireImpact({ x, y }), BEACON_DELAY_MS);
    window.setTimeout(() => onPick(value), PICK_ANIMATION_MS);
  }

  const stateFor = (key: Direction): PickState =>
    picked === null ? 'idle' : picked === key ? 'picked' : 'unpicked';

  return (
    <div className="warm-cold">
      <div className="warm-cold__buttons">
        <WCButton label="cold" variant="cold" state={stateFor('cold')} disabled={locked} onClick={(x, y) => submit('cold', x, y)} />
        <WCButton label="warm" variant="warm" state={stateFor('warm')} disabled={locked} onClick={(x, y) => submit('warm', x, y)} />
        <WCButton label="hot" variant="hot" state={stateFor('hot')} disabled={locked} onClick={(x, y) => submit('hot', x, y)} />
      </div>
      <div className="warm-cold__say">
        <div className="warm-cold__say-label">in your own words?</div>
        <input
          type="text"
          className="warm-cold__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="say more (optional)"
          disabled={locked}
        />
      </div>
    </div>
  );
}

function WCButton({
  label,
  variant,
  state,
  disabled,
  onClick,
}: {
  label: string;
  variant: 'warm' | 'cold' | 'hot';
  state: PickState;
  disabled?: boolean;
  onClick: (clickX: number, clickY: number) => void;
}) {
  const classes = [
    'wc-button',
    `wc-button--${variant}`,
    state === 'picked' ? 'wc-button--picked' : '',
    state === 'unpicked' ? 'wc-button--unpicked' : '',
  ].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = e.clientX || r.left + r.width / 2;
        const y = e.clientY || r.top + r.height / 2;
        onClick(x, y);
      }}
    >
      <span className="wc-button__text">{label}</span>
    </button>
  );
}
