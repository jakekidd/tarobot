// Running transcript of the reading — left column on desktop, full-page
// overlay on mobile. Shows the seer's monologues (intro, per-card beats
// with the card name prefix, outro) plus any user↔seer chat exchanges.
// Auto-scrolls to bottom on new lines. Copy button writes the whole
// thing as plain text.

import { useEffect, useMemo, useRef, useState } from 'react';
import { pickStall } from '../pipeline/seer';
import { highlightNames, type Highlights } from './dialogue/highlightNames';

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
  /** Names to color-emphasize inside message text. */
  highlights: Highlights;
  /** Optional close handler — when set, renders an X button next to COPY. */
  onClose?: () => void;
};

/** Strip persona's `_emphasis_` markers and lowercase everything for
 *  the transcript view. (Dialogue uses the markers to drive the
 *  animated underline — transcript is plain text, so the underscores
 *  are noise.) The highlighter handles the user name uppercase. */
function cleanForTranscript(s: string): string {
  return s.replace(/_/g, '').toLowerCase();
}

export function Transcript({ items, stallShown, highlights, onClose }: Props) {
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
        const who = m.speaker === 'user' ? 'you' : (m.label ? `seer · ${m.label}` : 'seer');
        return `${who}: ${cleanForTranscript(m.text)}`;
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
        <div className="transcript__actions">
          <button
            type="button"
            className="transcript__copy"
            onClick={copy}
            aria-label="copy transcript"
            disabled={items.length === 0}
          >
            {copied ? 'copied' : 'copy'}
          </button>
          {onClose && (
            <button
              type="button"
              className="transcript__close-x"
              onClick={onClose}
              aria-label="close transcript"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="transcript__scroll" ref={scrollRef}>
        {items.length === 0 && !stallShown && (
          <div className="transcript__empty">
            <em>nothing said yet.</em>
          </div>
        )}
        {items.map((m) => {
          const isLive = m.key.endsWith('-live');
          return (
          <div
            key={m.key}
            className={`transcript__line transcript__line--${m.speaker}${isLive ? ' transcript__line--live' : ''}`}
          >
            <span className="transcript__who">
              {m.speaker === 'user' ? 'you' : 'seer'}
              {m.label && (
                <span className="transcript__label"> · {m.label}</span>
              )}
            </span>
            <span className="transcript__text">{highlightNames(cleanForTranscript(m.text), highlights)}</span>
          </div>
          );
        })}
        {stallShown && (
          <div className="transcript__line transcript__line--seer transcript__line--stall">
            <span className="transcript__who">seer</span>
            <span className="transcript__text">
              <em>{stallPhrase}</em>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
