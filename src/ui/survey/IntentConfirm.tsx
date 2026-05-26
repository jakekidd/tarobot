// IntentConfirm — the closing question of the survey sandwich.
//
// Same visual language as the opener's intent ChatInput (centered,
// bigger), but no NOT YET button — by this point the survey is over,
// the user has to commit a question or statement. The dialogue above
// carries the prompt; this widget is input + send + (when available)
// a column of intention-suggestion chips that PSYCH's candidate set
// produced. Chip click submits directly; user can also type their
// own.
//
// Typed text shimmers along a turquoise gradient (CSS — see
// .intent-confirm in index.css). The hint below the input clarifies
// that either a question or a statement of intention works.

import { useState } from 'react';
import { ChatInput } from '../ChatInput';

type Props = {
  initialIntention: string | null;
  suggestions: string[];
  suggestionsLoading: boolean;
  onSubmit: (text: string) => void;
};

const MIN_CHARS = 10;

export function IntentConfirm({
  initialIntention,
  suggestions,
  suggestionsLoading,
  onSubmit,
}: Props) {
  const [showNudge, setShowNudge] = useState(false);
  const placeholder = initialIntention && initialIntention.length > 0
    ? initialIntention
    : 'a question, or a statement of intention…';

  function handleSend(text: string): void {
    const cleaned = text.trim();
    if (cleaned.length < MIN_CHARS) {
      setShowNudge(true);
      return;
    }
    onSubmit(cleaned);
  }

  function pickSuggestion(text: string): void {
    onSubmit(text);
  }

  return (
    <div className="intent-confirm">
      <ChatInput
        placeholder={placeholder}
        disabled={false}
        autoFocus
        hint="a question or a statement — either works"
        onSend={handleSend}
      />
      {showNudge && (
        <div className="intent-confirm__nudge" aria-live="polite">
          just a little more...
        </div>
      )}
      {(suggestions.length > 0 || suggestionsLoading) && (
        <div className="intent-confirm__suggestions" aria-live="polite">
          {suggestions.length > 0 && (
            <div className="intent-confirm__suggestions-hint">or pick one</div>
          )}
          <ul className="intent-confirm__chip-list">
            {suggestions.map((s, i) => (
              <li key={`${i}-${s.slice(0, 12)}`}>
                <button
                  type="button"
                  className="intent-confirm__chip"
                  onClick={() => pickSuggestion(s)}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
          {suggestionsLoading && (
            <div className="intent-confirm__suggestions-loading">
              <span className="intent-confirm__dot" />
              <span className="intent-confirm__dot" />
              <span className="intent-confirm__dot" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
