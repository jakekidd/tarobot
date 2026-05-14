// Name input — the one free-text moment in the survey. Includes a
// duplicate-name guard against existing local sessions.

import { useState } from 'react';

type Props = {
  onSubmit: (name: string) => void;
  /** Set of existing names (lowercase) to flag as duplicates. */
  existingNames: Set<string>;
};

export function NameForm({ onSubmit, existingNames }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (existingNames.has(trimmed.toLowerCase())) {
      setError('name already used');
      return;
    }
    onSubmit(trimmed);
  }

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
          className={`text-input text-input--ghost ${error ? 'text-input--error' : ''}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder="your name"
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
          aria-invalid={error !== null}
        />
        <button
          type="submit"
          className="btn btn--chrome btn--send"
          disabled={!draft.trim()}
        >
          enter
        </button>
      </form>
      {error && <div className="name-step__error" role="alert">{error}</div>}
    </div>
  );
}
