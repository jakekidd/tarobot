import { useState } from 'react';
import { fireImpact } from '../scene/impactStore';

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

type PickHandler = (value: string, idx: number, x: number, y: number) => void;
type PickState = 'idle' | 'picked' | 'unpicked';

/**
 * Picks the right choice layout based on count and binary flag.
 *
 * Layouts:
 *  - binary           → yes / no / idk (3 buttons in a row)
 *  - 2 or 3 options   → vertical list (rows)
 *  - 4 options        → 2×2 matrix
 *  - 5 or 6 options   → 3×2 matrix (3 rows × 2 cols)
 *
 * Modular by design — adding a new layout is a new component file.
 */
export function MultipleChoice({ suggestions, isBinary, disabled, onPick }: Props) {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);

  const handlePick: PickHandler = (value, idx, x, y) => {
    if (pickedIdx !== null) return;
    setPickedIdx(idx);
    window.setTimeout(() => fireImpact({ x, y }), BEACON_DELAY_MS);
    window.setTimeout(() => onPick(value), PICK_ANIMATION_MS);
  };

  const stateFor = (i: number): PickState =>
    pickedIdx === null ? 'idle' : pickedIdx === i ? 'picked' : 'unpicked';
  const lockedDisabled = disabled || pickedIdx !== null;

  if (isBinary) {
    return (
      <ChoiceBinary
        suggestions={suggestions}
        disabled={lockedDisabled}
        onPick={handlePick}
        stateFor={stateFor}
      />
    );
  }
  const n = suggestions.length;
  if (n === 0) return null;
  if (n <= 3) {
    return (
      <ChoiceList
        suggestions={suggestions}
        disabled={lockedDisabled}
        onPick={handlePick}
        stateFor={stateFor}
      />
    );
  }
  if (n === 4) {
    return (
      <ChoiceMatrix2x2
        suggestions={suggestions}
        disabled={lockedDisabled}
        onPick={handlePick}
        stateFor={stateFor}
      />
    );
  }
  // 5 or 6
  return (
    <ChoiceMatrix3x2
      suggestions={suggestions}
      disabled={lockedDisabled}
      onPick={handlePick}
      stateFor={stateFor}
    />
  );
}

type LayoutProps = {
  suggestions: string[];
  disabled?: boolean;
  onPick: PickHandler;
  stateFor: (i: number) => PickState;
};

// ─── Layout: List (2-3 rows) ────────────────────────────

function ChoiceList({ suggestions, disabled, onPick, stateFor }: LayoutProps) {
  return (
    <ul className="choice-list">
      {suggestions.map((s, i) => (
        <li key={`${i}-${s}`}>
          <ChoiceButton
            label={s}
            disabled={disabled}
            state={stateFor(i)}
            onClick={(x, y) => onPick(s, i, x, y)}
          />
        </li>
      ))}
    </ul>
  );
}

// ─── Layout: 2×2 matrix (4 options) ─────────────────────

function ChoiceMatrix2x2({ suggestions, disabled, onPick, stateFor }: LayoutProps) {
  return (
    <div className="choice-matrix choice-matrix--2x2">
      {suggestions.slice(0, 4).map((s, i) => (
        <ChoiceButton
          key={`${i}-${s}`}
          label={s}
          disabled={disabled}
          state={stateFor(i)}
          onClick={(x, y) => onPick(s, i, x, y)}
        />
      ))}
    </div>
  );
}

// ─── Layout: 3×2 matrix (5-6 options) ───────────────────

function ChoiceMatrix3x2({ suggestions, disabled, onPick, stateFor }: LayoutProps) {
  const slots = suggestions.slice(0, 6);
  // Pad to 6 so layout doesn't collapse with 5.
  while (slots.length < 6) slots.push('');
  return (
    <div className="choice-matrix choice-matrix--3x2">
      {slots.map((s, i) =>
        s ? (
          <ChoiceButton
            key={`${i}-${s}`}
            label={s}
            disabled={disabled}
            state={stateFor(i)}
            onClick={(x, y) => onPick(s, i, x, y)}
          />
        ) : (
          <div key={`pad-${i}`} className="choice-button choice-button--placeholder" />
        ),
      )}
    </div>
  );
}

// ─── Layout: Binary (yes / no / idk) ────────────────────

function ChoiceBinary({ suggestions, disabled, onPick, stateFor }: LayoutProps) {
  const opts = suggestions.length >= 2 ? suggestions.slice(0, 4) : ['yes', 'no', 'idk'];
  return (
    <div className="choice-binary">
      {opts.map((s, i) => (
        <ChoiceButton
          key={`${i}-${s}`}
          label={s}
          disabled={disabled}
          variant="binary"
          state={stateFor(i)}
          onClick={(x, y) => onPick(s, i, x, y)}
        />
      ))}
    </div>
  );
}

// ─── Shared button ──────────────────────────────────────

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
