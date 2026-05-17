// Debug-only queue panel for the survey. Shows the basket queue (next
// up), recently-asked nodes, and an "agents in flight" hint so we can
// see the engine breathing during testing.
//
// Renders as an absolute column on the LEFT of the viewport. Only
// visible when the debug chip is on AND survey state has been pushed
// to the bus.

import { useEffect, useState } from 'react';
import {
  getDebugSnapshot,
  subscribeDebug,
  type DebugValue,
} from './debugBus';

type Props = { visible: boolean };

export function DebugQueue({ visible }: Props) {
  const [snapshot, setSnapshot] = useState<Map<string, DebugValue>>(() => getDebugSnapshot());
  useEffect(() => subscribeDebug(() => setSnapshot(getDebugSnapshot())), []);

  if (!visible) return null;

  // Pull queue + asked from the bus. Both are encoded as comma-joined
  // node-id lists; the engine publishes them on each state change.
  const queue = parseList(snapshot.get('survey.queue'));
  const asked = parseList(snapshot.get('survey.asked'));
  const inflightPipelines = Number(snapshot.get('survey.inflight') ?? 0);
  const obs = Number(snapshot.get('survey.agent.observer') ?? 0);
  const det = Number(snapshot.get('survey.agent.detective') ?? 0);
  const intr = Number(snapshot.get('survey.agent.interrogator') ?? 0);
  const thinking = snapshot.get('survey.thinking') === true || snapshot.get('survey.thinking') === 'true';
  const total = Number(snapshot.get('survey.picks') ?? 0);
  const queueDepth = queue.length;

  return (
    <aside className="debug-queue" aria-label="survey queue debug">
      <div className="debug-queue__head">SURVEY</div>
      <table className="debug-queue__meta">
        <tbody>
          <tr><td>asked</td><td>{total}</td></tr>
          <tr><td>queued</td><td>{queueDepth}</td></tr>
          <tr><td>pipelines</td><td className={inflightPipelines > 0 ? 'on' : ''}>{inflightPipelines}</td></tr>
          <tr><td>observer</td><td className={obs > 0 ? 'on' : ''}>{obs}</td></tr>
          <tr><td>detective</td><td className={det > 0 ? 'on' : ''}>{det}</td></tr>
          <tr><td>interrogator</td><td className={intr > 0 ? 'on' : ''}>{intr}</td></tr>
          <tr><td>thinking</td><td className={thinking ? 'on' : ''}>{thinking ? 'yes' : 'no'}</td></tr>
        </tbody>
      </table>

      <div className="debug-queue__section">
        <div className="debug-queue__label">queue ({queueDepth})</div>
        <ol className="debug-queue__list">
          {queue.length === 0 && <li className="debug-queue__empty">(empty)</li>}
          {queue.map((id, i) => (
            <li key={`q-${i}-${id}`} className={i === 0 ? 'debug-queue__head-item' : ''}>
              {i === 0 ? '▶ ' : ''}{id}
            </li>
          ))}
        </ol>
      </div>

      <div className="debug-queue__section">
        <div className="debug-queue__label">asked ({asked.length})</div>
        <ol className="debug-queue__list debug-queue__list--asked">
          {asked.slice().reverse().slice(0, 12).map((id, i) => (
            <li key={`a-${i}-${id}`}>{id}</li>
          ))}
          {asked.length > 12 && (
            <li className="debug-queue__more">…+{asked.length - 12} more</li>
          )}
        </ol>
      </div>
    </aside>
  );
}

function parseList(v: DebugValue): string[] {
  if (typeof v !== 'string' || !v) return [];
  return v.split(',').filter((s) => s.length > 0);
}
