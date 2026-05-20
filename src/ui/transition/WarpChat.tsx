// Chat UI overlay rendered during the warp phase. Bottom-anchored,
// keeps the turtle visible above. Two layers: a vertically-stacked
// message list, then a single-line input at the very bottom.
//
// Two side-channels above the basic chat loop:
//
//   1. onTurtleSpeak — fires every time the turtle produces a line
//      (seed, normal reply, or silence-triggered reply). WarpDemo
//      uses it to bump a speech counter the scene listens for to
//      shift the turtle's perch. Motion is therefore speech-driven,
//      not on a fixed timer.
//
//   2. Silence trigger — when the user goes quiet, fire an async
//      AI call that sends "[silence]" as a stub user turn (NOT
//      added to the visible history). The agent's system prompt
//      knows what to do with this. Wait time backs off
//      exponentially (10s → 20s → 40s, capped at 60s), and resets
//      to 10s the moment the user types. If the user submits a
//      real message before the silence reply returns, the reply is
//      invalidated and discarded so it never lands stale.
//
// When the agent appends "<ready/>" to its reply OR the user clicks
// the "i'm ready" affordance, onReady() fires — parent runs the
// goodbye sequence.

import { useEffect, useRef, useState } from 'react';
import { loadApiKey } from '../../storage';
import {
  sendWarpChat,
  type ChatMessage,
  type WarpChatContext,
} from './warpChatAgent';
import { warpLog } from './warpLog';

type Props = {
  context: WarpChatContext;
  /** Fires when the agent or the user signals the chat is done. */
  onReady: () => void;
  /** Fires each time the turtle produces a chat line (seed included). */
  onTurtleSpeak?: () => void;
  /** Optional: disable input (e.g. during the goodbye sequence). */
  disabled?: boolean;
};

const SEED_TURTLE_MESSAGE = "okay. she's almost ready for you. how are you feeling?";

// Silence backoff. Starts at 10s; doubles after each silence-triggered
// reply, capped so we don't go totally idle.
const SILENCE_INITIAL_MS = 10_000;
const SILENCE_MAX_MS     = 60_000;
const SILENCE_STUB_USER  = '[silence]';

export function WarpChat({ context, onReady, onTurtleSpeak, disabled }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'turtle', text: SEED_TURTLE_MESSAGE, ts: Date.now() },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const apiKey = loadApiKey();

  // ── Silence backoff state ────────────────────────────
  const silenceTimerRef = useRef<number | null>(null);
  const silenceWaitMsRef = useRef<number>(SILENCE_INITIAL_MS);
  // Increments on every user-driven submit. In-flight silence calls
  // capture the value at fire time; if the value has moved by the
  // time they resolve, the reply is dropped.
  const userActivityIdRef = useRef<number>(0);
  // Latest message-list snapshot for callbacks (closures captured at
  // schedule time would otherwise see a stale history).
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Fire onTurtleSpeak for the seed once on mount so the pilot can
  // shift away from center for the first time.
  useEffect(() => {
    onTurtleSpeak?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  function clearSilenceTimer(): void {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function scheduleSilenceCheck(): void {
    clearSilenceTimer();
    if (!apiKey || disabled) return;
    const wait = silenceWaitMsRef.current;
    silenceTimerRef.current = window.setTimeout(() => { void fireSilenceCheck(); }, wait);
    warpLog(`silence timer armed: ${(wait / 1000).toFixed(0)}s`);
  }

  async function fireSilenceCheck(): Promise<void> {
    if (!apiKey) return;
    const fireToken = userActivityIdRef.current;
    warpLog('silence fire');
    try {
      const reply = await sendWarpChat(apiKey, context, messagesRef.current, SILENCE_STUB_USER);
      if (fireToken !== userActivityIdRef.current) {
        warpLog('silence reply stale — user spoke first; dropping');
        return;
      }
      if (reply.text.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: 'turtle', text: reply.text, ts: Date.now() },
        ]);
        onTurtleSpeak?.();
      }
      // Backoff and schedule the next check.
      silenceWaitMsRef.current = Math.min(silenceWaitMsRef.current * 2, SILENCE_MAX_MS);
      scheduleSilenceCheck();
    } catch (err) {
      warpLog(`silence fire failed: ${err instanceof Error ? err.message : String(err)}`);
      // On failure, still schedule next attempt with the same wait.
      scheduleSilenceCheck();
    }
  }

  // Schedule silence whenever message count changes (new turtle line
  // landing) OR on initial mount. User submits also re-arm via submit().
  useEffect(() => {
    scheduleSilenceCheck();
    return clearSilenceTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, disabled]);

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!text || sending || disabled || !apiKey) return;
    // Invalidate any in-flight silence reply + reset backoff.
    userActivityIdRef.current += 1;
    silenceWaitMsRef.current = SILENCE_INITIAL_MS;
    clearSilenceTimer();

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
      onTurtleSpeak?.();
      if (reply.ready) {
        // Brief beat so the closing line is readable before transition.
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
