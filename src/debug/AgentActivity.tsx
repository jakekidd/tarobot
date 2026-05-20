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
import { getSurveyState } from './surveyStateBus';
import type { PickEvent } from '../pipeline/survey';

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
          onClick={() => copyTranscript(events)}
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

// Build a markdown transcript of the survey's Q&A turns with each
// agent event (observer, detective, augur, etc.) attached to the turn
// that triggered it. Events whose `started_at` falls between Q[i]'s
// answered_at and Q[i+1]'s answered_at belong to Q[i]. Events that
// fired after the last Q are appended in an "end-of-survey compile"
// section.
function buildTranscript(events: readonly AgentEvent[]): string {
  const state = getSurveyState();
  const out: string[] = [];
  const now = new Date();
  out.push('# Tarobot pipeline transcript');
  out.push(`## ${now.toISOString()}`);
  if (state?.profile?.name) out.push(`## subject: ${state.profile.name}`);
  out.push('');
  const picks: readonly PickEvent[] = state?.picks_log ?? [];
  // Build slot windows: each pick gets a [startTs, endTs) window.
  const windows: Array<{ start: number; end: number; pick: PickEvent | null; label: string }> = [];
  let prev = 0;
  picks.forEach((p, i) => {
    windows.push({
      start: prev,
      end: p.answered_at,
      pick: p,
      label: `Q${i + 1}`,
    });
    prev = p.answered_at;
  });
  // Trailing window (events fired after the last pick — e.g. final
  // observer pass, augur, seer intro).
  windows.push({ start: prev, end: Number.POSITIVE_INFINITY, pick: null, label: 'end-of-survey compile' });

  for (const w of windows) {
    if (w.pick) {
      const p = w.pick;
      const answerText = typeof p.answer === 'string' ? p.answer : JSON.stringify(p.answer);
      out.push(`## ${w.label} · ${p.node_id}`);
      out.push(`Q: ${p.question_text}`);
      if (p.options_shown && p.options_shown.length > 0) {
        out.push(`Options: ${p.options_shown.join(' / ')}`);
      }
      out.push(`A: ${answerText}   [${p.latency_ms}ms]`);
    } else {
      out.push(`## ${w.label}`);
    }
    const matched = events.filter((e) => e.started_at >= w.start && e.started_at < w.end);
    if (matched.length === 0) {
      out.push('(no agent activity in this window)');
    } else {
      for (const e of matched) {
        const dur = e.ended_at ? `${((e.ended_at - e.started_at) / 1000).toFixed(1)}s` : 'in flight';
        const status = e.status === 'failed' ? ' FAILED' : e.status === 'started' ? ' (live)' : '';
        out.push('');
        out.push(`### ${e.label}${status} · ${e.model ?? '?'} · ${dur}`);
        if (e.error) {
          out.push(`error: ${e.error}`);
        }
        if (e.response_preview) {
          out.push('```');
          out.push(e.response_preview);
          out.push('```');
        }
      }
    }
    out.push('');
  }
  return out.join('\n');
}

function copyTranscript(events: readonly AgentEvent[]): void {
  const text = buildTranscript(events);
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      console.warn('[agent-activity] clipboard write failed; transcript:');
      console.log(text);
    });
  } else {
    console.warn('[agent-activity] no clipboard API; transcript:');
    console.log(text);
  }
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
      {ev.response_preview && (
        <details className="agent-activity__resp">
          <summary>response ({ev.response_size} chars)</summary>
          <pre>{ev.response_preview}</pre>
        </details>
      )}
    </div>
  );
}
