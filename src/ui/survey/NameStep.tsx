// NameStep — the input row for the player's name. The live "i'm sensing… a
// NAME" reaction renders up in the turtle's dialogue (see NameDialogue), so
// this component is just the controls: a color square (reroll the accent), the
// text field, and enter. It reports every keystroke up via onChange so the
// dialogue can sense in real time, mirroring the old relationship-naming
// mechanic. Letters and spaces only — a name can be nonsense, but it must not
// carry numbers or symbols into the portrait.

import { useState } from 'react';
import { randomAccent } from '../antechamber/relationshipHelpers';

type Props = {
  /** Fires on every keystroke / color reroll — drives the live dialogue sensing. */
  onChange: (name: string, color: string) => void;
  onSubmit: (name: string, color: string) => void;
};

function sanitizeName(raw: string): string {
  return raw.replace(/[^a-zA-Z ]/g, '');
}

export function NameStep({ onChange, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => randomAccent());
  const trimmed = name.trim();

  function setNameAndReport(next: string) {
    const clean = sanitizeName(next);
    setName(clean);
    onChange(clean.trim(), color);
  }

  function rerollColor() {
    const next = randomAccent(color);
    setColor(next);
    onChange(trimmed, next);
  }

  function submit() {
    if (!trimmed) return;
    onSubmit(trimmed, color);
  }

  return (
    <form className="name-step" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <button
        type="button"
        className="name-step__color"
        style={{ background: color }}
        onClick={rerollColor}
        aria-label="change the color of your name"
        title="click to change your color"
      />
      <input
        className="text-input text-input--ghost name-step__input"
        value={name}
        onChange={(e) => setNameAndReport(e.target.value)}
        placeholder="your name"
        autoFocus
        autoCapitalize="words"
        autoComplete="given-name"
        spellCheck={false}
      />
      <button type="submit" className="btn btn--chrome btn--send name-step__enter" disabled={!trimmed}>
        enter
      </button>
    </form>
  );
}
