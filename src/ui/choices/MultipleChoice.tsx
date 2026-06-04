import { useState } from 'react';
import { fireImpact } from '../scene/impactStore';
import { useChoiceReady } from './useChoiceReady';

type Props = {
  suggestions: string[];
  isBinary?: boolean;
  disabled?: boolean;
  onPick: (value: string) => void;
};

// Time from click → onPick. Long enough for the others to fade and the picked
// button to flash and "explode" out.
const PICK_ANIMATION_MS = 420;
// Delay after click before the beacon orb spawns — lets the explosion peak first
// so the wisp visually emerges from the bursting button.
const BEACON_DELAY_MS = 220;

type PickState = 'idle' | 'picked' | 'unpicked';

/**
 * Multiple choice picker. Always renders options as full-width vertical rows —
 * supports any N options. The only special-case is `isBinary`, which lays out
 * 2-3 short options in a horizontal row (yes / no / idk style).
 *
 * Questions with axes use Matrix2x2Choice instead — this component handles the
 * generic row case.
 */
export function MultipleChoice({ suggestions, isBinary, disabled, onPick }: Props) {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const ready = useChoiceReady();

  function handlePick(value: string, idx: number, x: number, y: number) {
    if (pickedIdx !== null) return;
    setPickedIdx(idx);
    window.setTimeout(() => fireImpact({ x, y }), BEACON_DELAY_MS);
    window.setTimeout(() => onPick(value), PICK_ANIMATION_MS);
  }

  const stateFor = (i: number): PickState =>
    pickedIdx === null ? 'idle' : pickedIdx === i ? 'picked' : 'unpicked';
  const lockedDisabled = disabled || pickedIdx !== null || !ready;

  if (suggestions.length === 0) return null;

  if (isBinary) {
    const opts = suggestions.length >= 2 ? suggestions : ['yes', 'no', 'idk'];
    return (
      <div className="choice-binary">
        {opts.map((s, i) => (
          <ChoiceButton
            key={`${i}-${s}`}
            label={s}
            disabled={lockedDisabled}
            variant="binary"
            state={stateFor(i)}
            onClick={(x, y) => handlePick(s, i, x, y)}
          />
        ))}
      </div>
    );
  }

  // Long option sets (7+) lay out as two columns so they don't run tall.
  const twoCol = suggestions.length >= 7;
  return (
    <ul className={twoCol ? 'choice-list choice-list--two-col' : 'choice-list'}>
      {suggestions.map((s, i) => (
        <li key={`${i}-${s}`}>
          <ChoiceButton
            label={s}
            disabled={lockedDisabled}
            state={stateFor(i)}
            onClick={(x, y) => handlePick(s, i, x, y)}
          />
        </li>
      ))}
    </ul>
  );
}

function ChoiceButton({
  label,
  disabled,
  onClick,
  variant,
  state,
}: {
  label: string;
  disabled?: boolean;
  onClick: (clickX: number, clickY: number) => void;
  variant?: 'binary';
  state: PickState;
}) {
  const classes = [
    'choice-button',
    variant ? `choice-button--${variant}` : '',
    state === 'picked' ? 'choice-button--picked' : '',
    state === 'unpicked' ? 'choice-button--unpicked' : '',
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
      <span className="choice-button__text">{label}</span>
    </button>
  );
}
