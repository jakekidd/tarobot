// Name input — the one free-text moment in the antechamber. If the typed
// name matches an existing Person, Antechamber.tsx surfaces the
// RESUME / START FRESH modal AFTER submission. This form just collects.

import { useState } from 'react';

type Props = {
  onSubmit: (name: string) => void;
  /** Lowercase names already in storage. Used only for a soft visual
   *  hint — submission is never blocked. The modal handles confirmation. */
  existingNames?: Set<string>;
};

export function NameForm({ onSubmit, existingNames }: Props) {
  const [draft, setDraft] = useState('');

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  const isKnown = !!existingNames?.has(draft.trim().toLowerCase());

  return (
    <div className="name-step">
      <form
        className="name-step__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="text-input text-input--ghost"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="your name"
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
        />
        <button
          type="submit"
          className="btn btn--chrome btn--send"
          disabled={!draft.trim()}
        >
          enter
        </button>
      </form>
      {isKnown && (
        <div className="name-step__hint" aria-live="polite">
          i recognize this name. i'll ask you to confirm.
        </div>
      )}
    </div>
  );
}
