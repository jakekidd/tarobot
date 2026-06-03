// WarmColdChoice — UI for diviner-emitted guesses. One screen: the
// COLD / WARM / HOT temperature cards (a row on desktop, a HOT-to-COLD
// stack on mobile) plus an optional "in your own words?" field beneath.
// Each card shows its symbol (snowflake / sun / flame), not the word.
// Tapping submits, carrying any text the user typed.
//
// Wire format submitted via onPick:
//   'cold' | 'warm' | 'hot'                        — temperature, no correction
//   'cold:<text>' | 'warm:<text>' | 'hot:<text>'   — temperature + correction

import { useState } from 'react';
import { fireImpact } from '../scene/impactStore';
import { useChoiceReady } from './useChoiceReady';
import coldIcon from '../icons/cold.svg';
import warmIcon from '../icons/warm.svg';
import hotIcon from '../icons/hot.svg';

type Props = {
  disabled?: boolean;
  onPick: (value: string) => void;
};

const PICK_ANIMATION_MS = 420;
const BEACON_DELAY_MS = 220;

type PickState = 'idle' | 'picked' | 'unpicked';
type Direction = 'cold' | 'warm' | 'hot';

const ICON: Record<Direction, string> = { cold: coldIcon, warm: warmIcon, hot: hotIcon };

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
        <WCButton dir="cold" state={stateFor('cold')} disabled={locked} onClick={(x, y) => submit('cold', x, y)} />
        <WCButton dir="warm" state={stateFor('warm')} disabled={locked} onClick={(x, y) => submit('warm', x, y)} />
        <WCButton dir="hot" state={stateFor('hot')} disabled={locked} onClick={(x, y) => submit('hot', x, y)} />
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
  dir,
  state,
  disabled,
  onClick,
}: {
  dir: Direction;
  state: PickState;
  disabled?: boolean;
  onClick: (clickX: number, clickY: number) => void;
}) {
  const classes = [
    'wc-button',
    `wc-button--${dir}`,
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
      <img className="wc-button__symbol" src={ICON[dir]} alt={dir} draggable={false} />
    </button>
  );
}
