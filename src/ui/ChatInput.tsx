// Shared text-input row used by both the reading and the survey.
//
//   reading: free-form chat to the seer ("say something to the seer").
//   survey:  custom-answer fallback for the current question ("or type
//            your own answer"). Submitting bypasses the choice grid.
//
// Same visual treatment in both surfaces — purple border when active,
// gray when disabled, runic up-arrow send button. The reading wraps
// this with its own active-prompt + listening-vs-active state; the
// survey just hands in a placeholder and an onSend callback.

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Placeholder shown when input is empty. */
  placeholder: string;
  /** When true, the input + button render in the disabled "listening…" pose. */
  disabled: boolean;
  /** Optional one-liner hint rendered above the input (italic, dim). */
  hint?: string;
  /** Autofocus on mount; useful when an active prompt is shown. */
  autoFocus?: boolean;
  /** Called with the trimmed text on submit. */
  onSend: (text: string) => void;
};

export function ChatInput({ placeholder, disabled, hint, autoFocus, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="reading__chat">
      {hint && (
        <div className="reading__chat-prompt" aria-live="polite">
          <em>{hint}</em>
        </div>
      )}
      <form
        className={`reading__chat-form ${disabled ? 'is-listening' : 'is-active'}`}
        onSubmit={handleSubmit}
      >
        <input
          ref={inputRef}
          className="reading__chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          disabled={disabled}
          placeholder={disabled ? 'listening…' : placeholder}
          aria-label={placeholder}
        />
        <button
          type="submit"
          className="reading__chat-send"
          disabled={disabled || draft.trim().length === 0}
          aria-label="send"
        >
          <SendArrow />
        </button>
      </form>
    </div>
  );
}

/** Runic up-arrow (Tiwaz-style) — the SEND glyph. */
function SendArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="20" />
      <line x1="12" y1="5" x2="6" y2="11" />
      <line x1="12" y1="5" x2="18" y2="11" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}
