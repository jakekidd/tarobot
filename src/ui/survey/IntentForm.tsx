// IntentForm — the special opener at the front of the survey.
// "do you have a question for the cards?"
//
// Two paths:
//   - User types their question and submits → submitAnswer(text)
//   - User clicks "I DON'T KNOW" → submitAnswer('') sentinel
//
// The engine maps empty → null on `initial_intention`. At survey close
// the IntentConfirm component asks again, with the initial as a starting
// point if they wrote one, or fresh if they didn't.

import { useState } from 'react';

type Props = {
  onSubmit: (answer: string) => void;
};

export function IntentForm({ onSubmit }: Props) {
  const [draft, setDraft] = useState('');

  function submitTyped() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  function submitDontKnow() {
    onSubmit('');
  }

  return (
    <div className="intent-form">
      <form
        className="intent-form__form"
        onSubmit={(e) => {
          e.preventDefault();
          submitTyped();
        }}
      >
        <input
          className="text-input text-input--ghost intent-form__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="type your question…"
          autoFocus
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn--chrome btn--send"
          disabled={!draft.trim()}
        >
          enter
        </button>
      </form>
      <button
        type="button"
        className="intent-form__dont-know"
        onClick={submitDontKnow}
      >
        I DON'T KNOW
      </button>
    </div>
  );
}
