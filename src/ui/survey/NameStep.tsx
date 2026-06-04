// NameStep — the one special, channel-free step (a name can be nonsense, so
// it must never bias the reads). It lifts the psychic-typing / color / caps
// mechanic wholesale from the old relationship-naming widget onto the
// PLAYER's own name: as they type, the turtle "senses" their name in caps,
// spaced out, in an accent color they can reroll. The color rides along in
// the RawPortrait so the name can glow the same hue everywhere downstream.

import { useState } from 'react';
import { randomAccent } from '../antechamber/relationshipHelpers';

type Props = {
  onSubmit: (name: string, color: string) => void;
};

export function NameStep({ onSubmit }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => randomAccent());

  const trimmed = name.trim();
  const article = /^[aeiou]/i.test(trimmed) ? 'an' : 'a';

  function submit() {
    if (!trimmed) return;
    onSubmit(trimmed, color);
  }

  return (
    <div className="name-step">
      <div className="name-step__sensing" aria-live="polite">
        i'm sensing… {article}{' '}
        <span className="name-step__sensed" style={{ color }}>
          {trimmed ? trimmed.toUpperCase() : '·····'}
        </span>
      </div>
      <form className="name-step__form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <button
          type="button"
          className="name-step__color"
          style={{ background: color }}
          onClick={() => setColor((p) => randomAccent(p))}
          aria-label="change the color of your name"
          title="click to change your color"
        />
        <input
          className="text-input text-input--ghost"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
          spellCheck={false}
        />
        <button type="submit" className="btn btn--chrome btn--send" disabled={!trimmed}>
          enter
        </button>
      </form>
    </div>
  );
}
