import { useState } from 'react';
import { Eyes } from './eyes/Eyes';

type Props = {
  onEnter: () => void;
};

/**
 * Transition: floating eyes in the dark with an [ENTER] button. The user
 * "enters the witch's tent." Once clicked, eyes fade out and the parent
 * navigates to the Tent screen.
 */
export function EnterTent({ onEnter }: Props) {
  const [fading, setFading] = useState(false);

  function go() {
    if (fading) return;
    setFading(true);
    window.setTimeout(onEnter, 700);
  }

  return (
    <div className={`enter-tent ${fading ? 'enter-tent--fading' : ''}`}>
      <div className="enter-tent__eyes">
        <Eyes />
      </div>
      <button className="enter-tent__btn btn btn--chrome btn--big" onClick={go} disabled={fading}>
        enter
      </button>
    </div>
  );
}
