// Debug HUD for the warp demo. Bottom-left overlay showing live stats
// (fps, viewport, camera, scene object count, current phase + elapsed)
// + a tail of the warp log + a button to copy ALL log lines to
// clipboard. Built so the user can dial in a tricky transition without
// fishing in devtools.

import { useEffect, useState } from 'react';
import {
  copyWarpLogs,
  getWarpLogs,
  getWarpStats,
  subscribeWarpLog,
  subscribeWarpStats,
  type WarpLogLine,
} from './warpLog';

type Props = {
  phase: string;
  phaseStartMs: number;
};

const TAIL_LINES = 6;

export function WarpDebug({ phase, phaseStartMs }: Props) {
  const [stats, setStats] = useState(() => getWarpStats());
  const [tail, setTail] = useState<WarpLogLine[]>(() => getWarpLogs().slice(-TAIL_LINES));
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => subscribeWarpStats(() => setStats(getWarpStats())), []);
  useEffect(() => subscribeWarpLog(() => setTail(getWarpLogs().slice(-TAIL_LINES))), []);

  // Tick the per-phase elapsed counter at ~10Hz — enough to read, cheap.
  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(performance.now() - phaseStartMs), 100);
    return () => window.clearInterval(id);
  }, [phaseStartMs]);

  async function onCopy(): Promise<void> {
    const ok = await copyWarpLogs();
    setCopyState(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopyState('idle'), 1500);
  }

  const statRows: Array<[string, string | number]> = [
    ['phase', phase],
    ['elapsed', `${(elapsedMs / 1000).toFixed(2)}s`],
    ['fps', stats.fps ?? '—'],
    ['viewport', stats.viewport ?? '—'],
    ['cam', stats.cam ?? '—'],
    ['scene.objs', stats['scene.objs'] ?? '—'],
  ];

  return (
    <aside className="warp-debug">
      <header className="warp-debug__head">
        <span>warp · debug</span>
        <button
          type="button"
          className="warp-debug__copy"
          onClick={onCopy}
          title={`copy all ${getWarpLogs().length} log lines to clipboard`}
        >
          {copyState === 'ok' ? 'copied ✓' : copyState === 'fail' ? 'fail ✗' : 'copy logs'}
        </button>
      </header>
      <table className="warp-debug__table">
        <tbody>
          {statRows.map(([k, v]) => (
            <tr key={k}>
              <td className="warp-debug__k">{k}</td>
              <td className="warp-debug__v">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tail.length > 0 && (
        <div className="warp-debug__tail">
          {tail.map((l, i) => (
            <div key={`${l.t}-${i}`} className="warp-debug__line">
              <span className="warp-debug__line-t">{(l.t / 1000).toFixed(2)}s</span>
              <span className="warp-debug__line-p">[{l.phase}]</span>
              <span className="warp-debug__line-m">{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
