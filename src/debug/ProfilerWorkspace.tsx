// ProfilerWorkspace — top region of the left debug column. Shows the
// profiler's non-committed thinking: the latest trigger, the model tier
// in use, reasoning, and the suspicions diff. This is the "I considered
// but didn't commit" log — sister surface to AnchorView (which shows
// the committed anchor).
//
// Visible only when the DEBUG navbar chip is on AND we're in the survey
// phase.

import { useEffect, useState } from 'react';
import {
  subscribeProfilerActivity,
  type ProfilerActivityEvent,
} from './profilerActivityBus';

type Props = { visible: boolean };

const RECENT_LIMIT = 5;

export function ProfilerWorkspace({ visible }: Props) {
  const [events, setEvents] = useState<readonly ProfilerActivityEvent[]>([]);
  useEffect(() => subscribeProfilerActivity(setEvents), []);

  if (!visible) return null;

  const recent = events.slice(-RECENT_LIMIT).reverse();
  const latest = recent[0];

  return (
    <section className="profiler-workspace" aria-label="profiler workspace">
      <div className="profiler-workspace__head">PROFILER</div>
      {!latest && (
        <div className="profiler-workspace__placeholder">
          standing by — fires every 3 turns + on corrections + at close
        </div>
      )}
      {latest && (
        <div className="profiler-workspace__latest">
          <div className="profiler-workspace__meta">
            <span>
              T{latest.turn} · {latest.trigger}
            </span>
            <span className={`profiler-workspace__tier profiler-workspace__tier--${latest.tier}`}>
              {latest.tier}
            </span>
            {latest.stale && (
              <span className="profiler-workspace__stale">stale</span>
            )}
          </div>
          {latest.reasoning && (
            <div className="profiler-workspace__reasoning">{latest.reasoning}</div>
          )}
          {(latest.suspicions_raised.length > 0 || latest.suspicions_dropped.length > 0) && (
            <div className="profiler-workspace__suspicions">
              {latest.suspicions_raised.map((s, i) => (
                <div key={`+${i}`} className="profiler-workspace__susp-raised">+ {s}</div>
              ))}
              {latest.suspicions_dropped.map((s, i) => (
                <div key={`-${i}`} className="profiler-workspace__susp-dropped">− {s}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {recent.length > 1 && (
        <details className="profiler-workspace__history">
          <summary>past passes ({recent.length - 1})</summary>
          {recent.slice(1).map((ev, i) => (
            <div key={i} className="profiler-workspace__history-row">
              <span>T{ev.turn} · {ev.trigger} · {ev.tier}</span>
              {ev.stale && <span className="profiler-workspace__stale"> stale</span>}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
