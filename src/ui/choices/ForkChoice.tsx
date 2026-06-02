// ForkChoice — answer widget for the `fork` question format.
//
// Renders the 9 dichotomy rows as a monospace ladder. Each row has
// three tap zones:
//   - left option        → onPick("left")
//   - vertical bar       → onPick("between:left/right")  (stuck-between)
//   - right option       → onPick("right")
//
// The bar is its own tap target (intentionally narrow but still
// clickable) because "stuck between" is the most diagnostically
// loaded answer — the user hasn't picked a side because the fork
// is acute right now.

import { useState } from 'react';
import { useChoiceReady } from './useChoiceReady';

type Props = {
  /** Options as strings of form "left | right". The parsePillarsMd
   *  parser stores fork options this way (one tuple per dichotomy);
   *  this component splits on the pipe. */
  options: string[];
  /** Fires when the user taps a side or the bar. Encoded as:
   *  - "left"  → user picked the left option of this row
   *  - "right" → user picked the right option
   *  - "between:left/right" → user picked the bar (stuck between) */
  onPick: (encoded: string) => void;
};

export function ForkChoice({ options, onPick }: Props) {
  // Lock to a single pick — once tapped, prevent further taps while
  // the engine processes the answer. pickedIdx === null means
  // "no pick yet"; any non-null value locks the rest.
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const ready = useChoiceReady();
  const locked = pickedIdx !== null;

  function tap(idx: number, encoded: string) {
    if (pickedIdx !== null) return;
    if (!ready) return;
    setPickedIdx(idx);
    // Fire immediately — no confirmation step. The visual state
    // change (selected row highlighted) is the feedback.
    onPick(encoded);
  }

  return (
    <ul className="fork-choice" aria-label="fork choice ladder">
      {options.map((option, i) => {
        const parts = option.split('|').map((s) => s.trim());
        const left = parts[0] ?? '';
        const right = parts[1] ?? '';
        if (!left || !right) return null;
        const isPicked = pickedIdx === i;
        const rowClass = `fork-choice__row${isPicked ? ' fork-choice__row--picked' : ''}`;
        const otherLocked = locked && !isPicked;
        return (
          <li key={`${left}-${right}-${i}`} className={rowClass}>
            <button
              type="button"
              className="fork-choice__side fork-choice__side--left"
              onClick={() => tap(i, left)}
              disabled={otherLocked || !ready}
            >
              {left}
            </button>
            <button
              type="button"
              className="fork-choice__bar"
              onClick={() => tap(i, `between:${left}/${right}`)}
              disabled={otherLocked || !ready}
              title={`stuck between ${left} and ${right}`}
              aria-label={`stuck between ${left} and ${right}`}
            />
            <button
              type="button"
              className="fork-choice__side fork-choice__side--right"
              onClick={() => tap(i, right)}
              disabled={otherLocked || !ready}
            >
              {right}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
