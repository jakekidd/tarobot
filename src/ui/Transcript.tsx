// Running chat log between the user and the seer. Left column of the
// reading layout. Auto-scrolls to bottom on new lines. Copy button in
// the corner copies the full transcript as plain text.
//
// Receives the chat from the engine state; the seer's beats (monologues
// attached to revealed cards) are NOT part of this transcript — those
// are delivered in the centre dialogue box during the reading flow.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '../pipeline/reading';
import { pickStall } from '../pipeline/reading';

type Props = {
  messages: ChatMessage[];
  /** True while a chat reply is being computed — show a brief stall row. */
  stallShown: boolean;
};

export function Transcript({ messages, stallShown }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // New stall phrase each time the stall transitions on, even though the
  // dep isn't read inside — that's the point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stallPhrase = useMemo(() => pickStall('persona'), [stallShown]);
  const [copied, setCopied] = useState(false);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, stallShown]);

  async function copy() {
    const text = messages
      .map((m) => `${m.speaker === 'user' ? 'you' : 'the seer'}: ${m.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* no clipboard — silently swallow */
    }
  }

  return (
    <div className="transcript" aria-label="transcript with the seer">
      <div className="transcript__head">
        <span className="transcript__title">transcript</span>
        <button
          type="button"
          className="transcript__copy"
          onClick={copy}
          aria-label="copy transcript"
          disabled={messages.length === 0}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <div className="transcript__scroll" ref={scrollRef}>
        {messages.length === 0 && !stallShown && (
          <div className="transcript__empty">
            <em>nothing said yet.</em>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`transcript__line transcript__line--${m.speaker}`}
          >
            <span className="transcript__who">
              {m.speaker === 'user' ? 'you' : 'the seer'}
            </span>
            <span className="transcript__text">{m.text}</span>
          </div>
        ))}
        {stallShown && (
          <div className="transcript__line transcript__line--seer transcript__line--stall">
            <span className="transcript__who">the seer</span>
            <span className="transcript__text">
              <em>{stallPhrase}</em>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
