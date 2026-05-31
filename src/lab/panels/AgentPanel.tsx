// Bench panel — Agent activity.
// Subscribes to the agentActivityBus and renders running + recent
// agent calls. Each row shows status dot, label, model tier, and
// duration. Click a row to expand into the full prompt + response.

import { useEffect, useState } from 'react';
import { Panel, Empty, Pill } from '../lib';
import {
  subscribeAgentActivity,
  type AgentEvent,
} from '../../debug/agentActivityBus';

export function AgentPanel() {
  const [events, setEvents] = useState<readonly AgentEvent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAgentActivity((evts) => setEvents(evts));
  }, []);

  const running = events.filter((e) => e.status === 'started');
  const recent = events.slice().reverse().slice(0, 30);

  return (
    <Panel
      title="agents"
      meta={
        <span className="bench__row bench__row--gap-2">
          {running.length > 0 && <Pill variant="warn">{running.length} in flight</Pill>}
          <span className="bench__panel-meta">{events.length} total</span>
        </span>
      }
    >
      {events.length === 0 ? (
        <Empty>no agent calls yet</Empty>
      ) : (
        <div>
          {recent.map((e) => (
            <AgentRow
              key={e.id}
              event={e}
              expanded={expanded === e.id}
              onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

type RowProps = {
  event: AgentEvent;
  expanded: boolean;
  onToggle: () => void;
};

function AgentRow({ event, expanded, onToggle }: RowProps) {
  const dotCls = `bench__agent-dot bench__agent-dot--${event.status === 'started' ? 'running' : event.status}`;
  const dur = event.ended_at ? `${event.ended_at - event.started_at}ms` : '...';
  return (
    <div>
      <div
        className="bench__agent-row"
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
      >
        <span className={dotCls} />
        <span className="bench__text-mono">{event.label}</span>
        <span className="bench__text-faint">{event.model ?? ''}</span>
        <span className="bench__text-faint">{dur}</span>
      </div>
      {expanded && (
        <div
          className="bench__stack bench__stack--gap-2"
          style={{ padding: '8px 0 16px 24px' }}
        >
          {event.system_preview && (
            <div>
              <div className="bench__field-label" style={{ marginBottom: 4 }}>
                system{event.system_size ? ` (${event.system_size} chars)` : ''}
              </div>
              <pre className="bench__json" style={{ maxHeight: 200, whiteSpace: 'pre-wrap' }}>
                {event.system_preview}
              </pre>
            </div>
          )}
          {event.user_preview && (
            <div>
              <div className="bench__field-label" style={{ marginBottom: 4 }}>
                user{event.user_size ? ` (${event.user_size} chars)` : ''}
              </div>
              <pre className="bench__json" style={{ maxHeight: 200, whiteSpace: 'pre-wrap' }}>
                {event.user_preview}
              </pre>
            </div>
          )}
          {event.response_preview && (
            <div>
              <div className="bench__field-label" style={{ marginBottom: 4 }}>
                response{event.response_size ? ` (${event.response_size} chars)` : ''}
              </div>
              <pre className="bench__json" style={{ maxHeight: 200, whiteSpace: 'pre-wrap' }}>
                {event.response_preview}
              </pre>
            </div>
          )}
          {event.error && (
            <div>
              <div className="bench__field-label bench__text-accent" style={{ marginBottom: 4 }}>
                error
              </div>
              <pre className="bench__json" style={{ maxHeight: 120, whiteSpace: 'pre-wrap' }}>
                {event.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
