// Running transcript of the reading — left column on desktop, full-page
// overlay on mobile. Shows the seer's monologues (intro, per-card beats
// with the card name prefix, outro) plus any user↔seer chat exchanges.
// Auto-scrolls to bottom on new lines. Copy button writes the whole
// thing as plain text.

import { useEffect, useMemo, useRef, useState } from 'react';
import { pickStall } from '../pipeline/reading';

export type TranscriptItem = {
  speaker: 'user' | 'seer';
  text: string;
  /** Optional label rendered as a prefix on the "who" line (e.g., card name). */
  label?: string;
  key: string;
};

type Props = {
  items: TranscriptItem[];
  /** True while a chat reply is being computed — show a brief stall row. */
  stallShown: boolean;
};

export function Transcript({ items, stallShown }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // New stall phrase each time the stall transitions on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stallPhrase = useMemo(() => pickStall('persona'), [stallShown]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, stallShown]);

  async function copy() {
    const text = items
      .map((m) => {
        const who = m.speaker === 'user' ? 'you' : (m.label ? `the seer (${m.label})` : 'the seer');
        return `${who}: ${m.text}`;
      })
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* no clipboard */
    }
  }

  return (
    <div className="transcript" aria-label="reading transcript">
      <div className="transcript__head">
        <span className="transcript__title">transcript</span>
        <button
          type="button"
          className="transcript__copy"
          onClick={copy}
          aria-label="copy transcript"
          disabled={items.length === 0}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <div className="transcript__scroll" ref={scrollRef}>
        {items.length === 0 && !stallShown && (
          <div className="transcript__empty">
            <em>nothing said yet.</em>
          </div>
        )}
        {items.map((m) => (
          <div
            key={m.key}
            className={`transcript__line transcript__line--${m.speaker}`}
          >
            <span className="transcript__who">
              {m.speaker === 'user' ? 'you' : 'the seer'}
              {m.label && (
                <span className="transcript__label"> · {m.label}</span>
              )}
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
