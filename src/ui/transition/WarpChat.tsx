// Chat UI overlay rendered during the warp phase. Bottom-anchored,
// keeps the turtle visible above. Two layers: a vertically-stacked
// message list, then a single-line input at the very bottom.
//
// When the agent appends "<ready/>" to its reply, or the user clicks
// the small "i'm ready" affordance, onReady() fires — parent (WarpDemo)
// triggers the goodbye-line sequence and the disintegrate phase.

import { useEffect, useRef, useState } from 'react';
import { loadApiKey } from '../../storage';
import {
  sendWarpChat,
  type ChatMessage,
  type WarpChatContext,
} from './warpChatAgent';

type Props = {
  /** Survey-side context. Stub in demo, real in prod. */
  context: WarpChatContext;
  /** Fires when the agent or the user signals the chat is done. */
  onReady: () => void;
  /** Optional: disable input (e.g. during the goodbye sequence). */
  disabled?: boolean;
};

// First turtle message — seeded so the user has something to react to
// without needing to start the conversation cold. Tone-set, no insight.
const SEED_TURTLE_MESSAGE = "okay. she's almost ready for you. how are you feeling?";

export function WarpChat({ context, onReady, disabled }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'turtle', text: SEED_TURTLE_MESSAGE, ts: Date.now() },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const apiKey = loadApiKey();

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!text || sending || disabled || !apiKey) return;
    const userMsg: ChatMessage = { role: 'user', text, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setDraft('');
    setSending(true);
    setError(null);
    try {
      const reply = await sendWarpChat(apiKey, context, messages, text);
      setMessages([
        ...next,
        { role: 'turtle', text: reply.text, ts: Date.now() },
      ]);
      if (reply.ready) {
        // Brief delay so the user can read the closing line before the
        // transition kicks off.
        window.setTimeout(() => onReady(), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'chat failed');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  // No API key → show a friendly hint instead of the chat. Keeps the
  // demo usable for visual testing even without a key set.
  if (!apiKey) {
    return (
      <div className="warp-chat warp-chat--no-key">
        <div className="warp-chat__no-key-msg">
          chat disabled — set your anthropic api key in the main app, then refresh.
        </div>
        <button
          type="button"
          className="warp-chat__ready"
          onClick={onReady}
        >
          skip to goodbye →
        </button>
      </div>
    );
  }

  return (
    <div className="warp-chat">
      <div className="warp-chat__messages" ref={listRef}>
        {messages.map((m, i) => (
          <div
            key={`${m.ts}-${i}`}
            className={`warp-chat__msg warp-chat__msg--${m.role}`}
          >
            {m.role === 'turtle' && <span className="warp-chat__dot" aria-hidden>●</span>}
            <span className="warp-chat__text">{m.text}</span>
          </div>
        ))}
        {sending && (
          <div className="warp-chat__msg warp-chat__msg--turtle warp-chat__msg--thinking">
            <span className="warp-chat__dot" aria-hidden>●</span>
            <span className="warp-chat__text">…</span>
          </div>
        )}
        {error && (
          <div className="warp-chat__error">chat error: {error}</div>
        )}
      </div>
      <div className="warp-chat__input-row">
        <input
          type="text"
          className="warp-chat__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={sending ? '…' : 'say something'}
          disabled={sending || disabled}
          autoFocus
        />
        <button
          type="button"
          className="warp-chat__ready"
          onClick={onReady}
          title="end chat and begin the reading"
        >
          i'm ready →
        </button>
      </div>
    </div>
  );
}
