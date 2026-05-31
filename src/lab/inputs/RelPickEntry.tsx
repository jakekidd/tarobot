// Bench input — RelPickEntry.
// Stripped-down relationship_pick: pick a category, type a name, emit
// the JSON payload the engine's applyRelationshipPick expects.
// Skips the full main-app flow (color picker, pronoun toggle, dice
// rerolls) — Bench is for engine iteration, not the production cast
// authoring surface.

import { useState, type FormEvent } from 'react';
import { Button } from '../lib';

type Category =
  | 'self' | 'parent' | 'sibling' | 'child' | 'partner' | 'friend' | 'boss';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'self',     label: 'me' },
  { id: 'partner',  label: 'partner' },
  { id: 'parent',   label: 'parent / caretaker' },
  { id: 'sibling',  label: 'sibling' },
  { id: 'friend',   label: 'friend' },
  { id: 'child',    label: 'child' },
  { id: 'boss',     label: 'boss' },
];

type Props = {
  /** Used when the user picks 'self' — sent as the cast label. */
  selfName: string;
  onSubmit: (encoded: string) => void;
};

export function RelPickEntry({ selfName, onSubmit }: Props) {
  const [category, setCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');

  function pickCategory(c: Category) {
    if (c === 'self') {
      onSubmit(JSON.stringify({ category: 'self', name: selfName || 'me' }));
      return;
    }
    setCategory(c);
  }

  function submitWho(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!category || !trimmed) return;
    onSubmit(JSON.stringify({ category, name: trimmed }));
  }

  if (category === null) {
    return (
      <div className="bench__choices">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className="bench__choice"
            onClick={() => pickCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form className="bench__stack bench__stack--gap-3" onSubmit={submitWho}>
      <div className="bench__field-label">who? ({category})</div>
      <input
        type="text"
        className="bench__input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="a name"
        autoFocus
      />
      <div className="bench__row bench__row--gap-2 bench__row--end">
        <Button onClick={() => { setCategory(null); setName(''); }} variant="ghost">change</Button>
        <Button type="submit" variant="primary" disabled={name.trim().length === 0}>confirm</Button>
      </div>
    </form>
  );
}
