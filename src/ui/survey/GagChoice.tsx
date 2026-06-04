// GagChoice — the "do you mind if i ask you some questions?" false choice.
//
// It mounts only after the dialogue has typed out, then reveals one option at
// a time with a beat between: Yes. (white) first, then No. (red). Pressing
// EITHER inverts both — swapping word and color — because it's a gag: there's
// no effect, you're already past the disclaimer. Either release proceeds.

import { useEffect, useState } from 'react';

type Props = {
  onChoose: () => void;
};

const YES = { word: 'Yes.', cls: 'gag-choice__yes' };
const NO = { word: 'No.', cls: 'gag-choice__no' };

// A beat before Yes, another before No.
const BEAT_BEFORE_YES = 650;
const BEAT_BEFORE_NO = 650;

export function GagChoice({ onChoose }: Props) {
  const [pressing, setPressing] = useState(false);
  const [revealed, setRevealed] = useState(0); // 0 none · 1 yes · 2 yes+no

  useEffect(() => {
    const t1 = window.setTimeout(() => setRevealed(1), BEAT_BEFORE_YES);
    const t2 = window.setTimeout(() => setRevealed(2), BEAT_BEFORE_YES + BEAT_BEFORE_NO);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  // Base: left = Yes, right = No. Under a press, they swap (the gag).
  const left = pressing ? NO : YES;
  const right = pressing ? YES : NO;

  const press = () => setPressing(true);
  const release = () => { setPressing(false); onChoose(); };
  const leave = () => setPressing(false);

  return (
    <div className="gag-choice">
      {revealed >= 1 && (
        <button
          type="button"
          className={`gag-choice__btn ${left.cls}`}
          onPointerDown={press}
          onPointerUp={release}
          onPointerLeave={leave}
        >
          {left.word}
        </button>
      )}
      {revealed >= 2 && (
        <button
          type="button"
          className={`gag-choice__btn ${right.cls}`}
          onPointerDown={press}
          onPointerUp={release}
          onPointerLeave={leave}
        >
          {right.word}
        </button>
      )}
    </div>
  );
}
