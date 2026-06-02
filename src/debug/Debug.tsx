// Debug overlay. Renders a compact panel at the top-left of the viewport
// showing every key currently in the debug bus, plus a live FPS counter
// and a poll of audio context state. Toggle via the DEBUG chip in the
// navbar; visibility persists in localStorage.

import { useEffect, useState } from 'react';
import { audioState } from '../ui/sound/sound';
import { getInFlight } from '../pipeline/llm';
import { isUsingTreeOverride } from '../pipeline/antechamber';
import {
  getDebugSnapshot,
  publishDebug,
  subscribeDebug,
  type DebugValue,
} from './debugBus';

type Props = {
  visible: boolean;
};

// Key display order — anything not in here renders at the bottom in
// alphabetical order. Hand-picked so the most diagnostic fields read
// from a screenshot at a glance.
const KEY_ORDER = [
  'fps',
  'app.phase',
  'audio',
  'llm.inflight',
  'survey.thinking',
  'reading.phase',
  'errors.count',
  'errors.last',
  'viewport',
];

const KEY_LABEL: Record<string, string> = {
  'fps':               'fps',
  'app.phase':         'phase',
  'audio':             'audio',
  'llm.inflight':      'llm',
  'survey.thinking':   'sv think',
  'reading.phase':     'rd phase',
  'errors.count':      'errors',
  'errors.last':       'last err',
  'viewport':          'vp',
};

export function Debug({ visible }: Props) {
  const [snapshot, setSnapshot] = useState<Map<string, DebugValue>>(() => getDebugSnapshot());

  // Subscribe to bus changes.
  useEffect(() => {
    return subscribeDebug(() => setSnapshot(getDebugSnapshot()));
  }, []);

  // Self-publish: FPS, audio state, tree override, llm in-flight. These
  // are read-only probes, not state we own anywhere else.
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let frames = 0;
    let lastTick = performance.now();
    let lastProbe = performance.now();

    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - lastTick >= 1000) {
        publishDebug('fps', Math.round((frames * 1000) / (now - lastTick)));
        frames = 0;
        lastTick = now;
      }
      // Cheaper probes every 250ms — no need every frame.
      if (now - lastProbe >= 250) {
        publishDebug('audio', audioState());
        publishDebug('tree', isUsingTreeOverride() ? 'override' : 'bundled');
        const ifl = getInFlight();
        publishDebug('llm.inflight', ifl.count);
        publishDebug('llm.last', ifl.lastTier ?? '—');
        lastProbe = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  const rows = orderRows(snapshot);

  return (
    <aside className="debug" aria-label="debug overlay">
      <div className="debug__head">DEBUG</div>
      <table className="debug__table">
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key}>
              <td className="debug__k">{KEY_LABEL[key] ?? key}</td>
              <td className={`debug__v ${classifyValue(key, value)}`}>{format(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

function orderRows(snapshot: Map<string, DebugValue>): [string, DebugValue][] {
  const known: [string, DebugValue][] = [];
  const extras: [string, DebugValue][] = [];
  const seen = new Set<string>();
  for (const k of KEY_ORDER) {
    if (snapshot.has(k)) {
      known.push([k, snapshot.get(k)]);
      seen.add(k);
    }
  }
  for (const [k, v] of snapshot) {
    if (!seen.has(k)) extras.push([k, v]);
  }
  extras.sort(([a], [b]) => a.localeCompare(b));
  return [...known, ...extras];
}

function format(v: DebugValue): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/** Hint the value's status so the overlay can color it. */
function classifyValue(key: string, v: DebugValue): string {
  if (key === 'audio') {
    if (v === 'running') return 'debug__v--ok';
    if (v === 'suspended' || v === 'closed') return 'debug__v--warn';
    if (v === 'null') return 'debug__v--bad';
  }
  if (key === 'errors.count' && typeof v === 'number' && v > 0) return 'debug__v--warn';
  if (key === 'llm.inflight' && typeof v === 'number' && v > 0) return 'debug__v--info';
  if (key === 'tree' && v === 'override') return 'debug__v--info';
  if (key === 'fps' && typeof v === 'number' && v > 0 && v < 30) return 'debug__v--warn';
  return '';
}
