// GagChoice — the "do you mind if i ask you some questions?" false choice.
//
// Yes. is white, No. is red. While you press EITHER one, both options invert —
// swapping word and color with the other — because it's a gag: there's no
// effect, you're already past the disclaimer (if you minded, you'd have left,
// not tapped). Either release proceeds.

import { useState } from 'react';

type Props = {
  onChoose: () => void;
};

const YES = { word: 'Yes.', cls: 'gag-choice__yes' };
const NO = { word: 'No.', cls: 'gag-choice__no' };

export function GagChoice({ onChoose }: Props) {
  const [pressing, setPressing] = useState(false);

  // Base: left = Yes (white), right = No (red). Under a press, they swap.
  const left = pressing ? NO : YES;
  const right = pressing ? YES : NO;

  return (
    <div className="gag-choice">
      {[left, right].map((opt, i) => (
        <button
          key={i}
          type="button"
          className={`gag-choice__btn ${opt.cls}`}
          onPointerDown={() => setPressing(true)}
          onPointerUp={() => { setPressing(false); onChoose(); }}
          onPointerLeave={() => setPressing(false)}
        >
          {opt.word}
        </button>
      ))}
    </div>
  );
}
