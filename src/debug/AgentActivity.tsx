// Floating panel that shows the live agent activity stream. Renders a
// rolling log of every adapter.invoke / invokeFreeform call: label,
// model tier, status (started / completed / failed), duration once
// done, and a truncated response preview.
//
// Mounted by App.tsx when debug is on OR when the user is on compiling
// / reading phases (where "what's the seer doing" is the question).
// Hides itself when there's nothing recent to show.

import { useEffect, useRef, useState } from 'react';
import { subscribeAgentActivity, type AgentEvent } from './agentActivityBus';
import { copyTranscriptToClipboard } from './transcript';

const VISIBLE_LIMIT = 14;

type Props = {
  /** Caller may force-show during certain phases (e.g. compiling). When
   *  false AND debug isn't on, the panel hides itself if empty. */
  alwaysVisible?: boolean;
};

export function AgentActivity({ alwaysVisible = false }: Props) {
  const [events, setEvents] = useState<readonly AgentEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeAgentActivity((next) => setEvents(next));
  }, []);

  // 1Hz "now" tick so in-flight durations update visibly while a call
  // is still pending. Reads from state so the render is pure.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const anyInFlight = events.some((e) => e.status === 'started');
    if (!anyInFlight) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [events]);

  // Auto-scroll to most recent event.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  if (!alwaysVisible && events.length === 0) return null;

  const visible = events.slice(-VISIBLE_LIMIT);
  return (
    <aside className="agent-activity" aria-label="agent activity">
      <header className="agent-activity__head">
        <span className="agent-activity__title">agents</span>
        <button
          type="button"
          className="agent-activity__copy"
          onClick={copyTranscriptToClipboard}
          title="copy a markdown transcript of all Q&A turns + agent traces to clipboard"
        >
          copy transcript
        </button>
        <span className="agent-activity__sub">
          {events.filter((e) => e.status === 'started').length} in flight ·{' '}
          {events.length} total
        </span>
      </header>
      <div className="agent-activity__body" ref={scrollRef}>
        {visible.map((e) => (
          <AgentRow key={e.id} ev={e} now={now} />
        ))}
        {visible.length === 0 && (
          <div className="agent-activity__empty">
            no agents have fired yet.
          </div>
        )}
      </div>
    </aside>
  );
}

function AgentRow({ ev, now }: { ev: AgentEvent; now: number }) {
  const dur = ev.ended_at
    ? `${((ev.ended_at - ev.started_at) / 1000).toFixed(1)}s`
    : `${((now - ev.started_at) / 1000).toFixed(1)}s…`;
  const statusClass =
    ev.status === 'failed'
      ? 'agent-activity__row--failed'
      : ev.status === 'completed'
        ? 'agent-activity__row--ok'
        : 'agent-activity__row--inflight';
  return (
    <div className={`agent-activity__row ${statusClass}`}>
      <div className="agent-activity__row-head">
        <span className="agent-activity__label">{ev.label}</span>
        {ev.model && <span className="agent-activity__model">{ev.model}</span>}
        <span className="agent-activity__dur">{dur}</span>
      </div>
      {ev.error && (
        <div className="agent-activity__err" title={ev.error}>
          {ev.error.length > 120 ? `${ev.error.slice(0, 120)}…` : ev.error}
        </div>
      )}
      {(ev.system_preview || ev.user_preview) && (
        <details className="agent-activity__resp">
          <summary>
            payload
            {ev.user_size !== undefined && ` (user ${ev.user_size} chars`}
            {ev.system_size !== undefined && `, system ${ev.system_size} chars`}
            {ev.user_size !== undefined && ')'}
          </summary>
          {ev.system_preview && (
            <>
              <div className="agent-activity__resp-label">system:</div>
              <pre>{ev.system_preview}</pre>
            </>
          )}
          {ev.user_preview && (
            <>
              <div className="agent-activity__resp-label">user:</div>
              <pre>{ev.user_preview}</pre>
            </>
          )}
        </details>
      )}
      {ev.response_preview && (
        <details className="agent-activity__resp">
          <summary>response ({ev.response_size} chars)</summary>
          <pre>{ev.response_preview}</pre>
        </details>
      )}
    </div>
  );
}
