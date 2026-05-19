// Gag screen wedged in front of the 13th post-opener question. Pure UI
// — the engine state is untouched, so the question the engine was about
// to ask is simply deferred one screen until `onDismiss` fires. The
// gag is NEVER recorded in picks_log, profile, or anywhere downstream.
//
// Theatrics, by spec:
//   - title "which is the best animal" (NO question mark), green text
//   - four green buttons. three say TURTLE; the fourth says
//     "CAT............ IS A CLOSE SECOND, BUT TURTLE" with the
//     post-ellipsis half clipped by overflow:hidden + fixed height
//   - clicking the CAT button expands the row down to reveal the
//     hidden second line; clicking anything thereafter dismisses
//   - text entry: any printable key → appends "TURTLE" (space-separated);
//     backspace deletes a char normally; enter dismisses. Paste blocked.

import { useState, type KeyboardEvent, type ClipboardEvent } from 'react';

const TURTLE_BUTTONS = 3;
const CAT_LINE_1 = 'CAT............';
const CAT_LINE_2 = ' IS A CLOSE SECOND, BUT TURTLE';

type Props = {
  onDismiss: () => void;
};

export function GagQuestion({ onDismiss }: Props) {
  const [catExpanded, setCatExpanded] = useState(false);
  const [text, setText] = useState('');

  function handleCatClick(): void {
    if (!catExpanded) {
      // First click: reveal the cut-off second line. Don't dismiss yet —
      // the gag wants the user to read the whole punchline.
      setCatExpanded(true);
      return;
    }
    onDismiss();
  }

  function handleTurtleClick(): void {
    onDismiss();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    // Enter submits (dismiss). Backspace acts normally. Everything else
    // printable → append " TURTLE" (or "TURTLE" if the box is empty).
    if (e.key === 'Enter') {
      e.preventDefault();
      onDismiss();
      return;
    }
    if (e.key === 'Backspace') {
      // Let the input handle normal char-by-char delete via state.
      e.preventDefault();
      setText((t) => t.slice(0, -1));
      return;
    }
    // Allow meta combos (Cmd/Ctrl + something) through unchanged — they
    // can't add characters anyway.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Single-character printable keys: intercept and append.
    if (e.key.length === 1) {
      e.preventDefault();
      setText((t) => (t.length === 0 ? 'TURTLE' : `${t} TURTLE`));
    }
  }

  function blockPaste(e: ClipboardEvent<HTMLInputElement>): void {
    e.preventDefault();
  }

  return (
    <div className="gag">
      <div className="gag__buttons">
        {Array.from({ length: TURTLE_BUTTONS }).map((_, i) => (
          <button
            key={`turtle-${i}`}
            className="btn btn--gag"
            onClick={handleTurtleClick}
          >
            TURTLE
          </button>
        ))}
        <button
          className={`btn btn--gag btn--gag-cat ${catExpanded ? 'is-expanded' : ''}`}
          onClick={handleCatClick}
        >
          <span className="btn--gag-cat__line">{CAT_LINE_1}</span>
          <span className="btn--gag-cat__line btn--gag-cat__line--two">{CAT_LINE_2}</span>
        </button>
      </div>
      <input
        className="text-input text-input--ghost gag__input"
        value={text}
        onKeyDown={handleKeyDown}
        onChange={() => { /* controlled — onKeyDown is the source of truth */ }}
        onPaste={blockPaste}
        placeholder="or type your own answer"
        autoFocus
      />
    </div>
  );
}
