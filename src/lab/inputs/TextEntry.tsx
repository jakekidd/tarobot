// Bench input — TextEntry.
// Single-line text field with submit-on-enter. Used for 'text' opener
// (name) and 'intent' opener (the user's question). Also doubles as
// the fallback for relationship_pick in Bench's minimal flow.

import { useState, type FormEvent } from 'react';
import { Button } from '../lib';

type Props = {
  placeholder?: string;
  submitLabel?: string;
  /** If true, allow submitting empty (e.g. "I DON'T KNOW" path on intent). */
  allowEmpty?: boolean;
  onSubmit: (text: string) => void;
};

export function TextEntry({ placeholder, submitLabel = 'submit', allowEmpty, onSubmit }: Props) {
  const [text, setText] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!allowEmpty && trimmed.length === 0) return;
    onSubmit(trimmed);
    setText('');
  }

  return (
    <form className="bench__stack bench__stack--gap-2" onSubmit={handleSubmit}>
      <input
        type="text"
        className="bench__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      <div className="bench__row bench__row--gap-2 bench__row--end">
        <Button type="submit" variant="primary" disabled={!allowEmpty && text.trim().length === 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
