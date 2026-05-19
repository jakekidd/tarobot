// IntentConfirm — the closing question of the sandwich.
//
// Two flavors depending on whether the user typed an initial intention:
//   - initial != null: "this is the question you had for the cards when
//     you arrived. is it still the question you have now?" Input is
//     pre-filled with the initial; user can confirm or edit.
//   - initial === null: "do you now know your question for the cards?"
//     Fresh empty input. They must type one.
//
// Submission requires ≥10 chars. Below that, a soft red italic nudge
// "just a little more..." appears beneath the field.

import { useState } from 'react';

type Props = {
  initialIntention: string | null;
  onSubmit: (text: string) => void;
};

const MIN_CHARS = 10;

export function IntentConfirm({ initialIntention, onSubmit }: Props) {
  const [draft, setDraft] = useState(initialIntention ?? '');
  const [showNudge, setShowNudge] = useState(false);

  const hasInitial = initialIntention !== null && initialIntention.length > 0;
  const cleaned = draft.trim();
  const meetsMinimum = cleaned.length >= MIN_CHARS;

  function submit() {
    if (!meetsMinimum) {
      setShowNudge(true);
      return;
    }
    onSubmit(cleaned);
  }

  return (
    <div className="intent-confirm">
      <p className="intent-confirm__prompt">
        {hasInitial
          ? "this is the question you had for the cards when you arrived. is it still the question you have now?"
          : "do you now know your question for the cards?"}
      </p>
      <form
        className="intent-confirm__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="text-input text-input--ghost intent-confirm__input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (showNudge && e.target.value.trim().length >= MIN_CHARS) {
              setShowNudge(false);
            }
          }}
          placeholder={hasInitial ? '' : 'your question…'}
          autoFocus
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn--chrome btn--send"
          disabled={cleaned.length === 0}
        >
          confirm
        </button>
      </form>
      {showNudge && (
        <div className="intent-confirm__nudge" aria-live="polite">
          just a little more...
        </div>
      )}
    </div>
  );
}
