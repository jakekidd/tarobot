// IntentConfirm — the closing question of the survey sandwich.
//
// Same visual language as the opener's intent ChatInput (centered,
// bigger), but no NOT YET button — by this point the survey is over,
// the user has to commit a question or statement. The dialogue above
// carries the prompt; this widget is just input + send.
//
// Typed text shimmers along a turquoise gradient (CSS — see
// .intent-confirm in index.css). The hint below the input clarifies
// that either a question or a statement of intention works.

import { useState } from 'react';
import { ChatInput } from '../ChatInput';

type Props = {
  initialIntention: string | null;
  onSubmit: (text: string) => void;
};

const MIN_CHARS = 10;

export function IntentConfirm({ initialIntention, onSubmit }: Props) {
  const [showNudge, setShowNudge] = useState(false);
  // Pre-fill is harder with ChatInput (it owns its own draft state). For
  // now: if the user came in with an initial intention, surface it as
  // placeholder text so they can either restate it or write fresh.
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
    </div>
  );
}
