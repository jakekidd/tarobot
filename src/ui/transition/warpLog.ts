// Tiny module-level log buffer for the warp demo. Anyone in the
// transition module can call warpLog('msg') and the HUD's "copy logs"
// button will dump everything to clipboard. Subscribers get a notify on
// every push so the HUD can also render the tail live.
//
// Capped at MAX_LINES — oldest entries drop off the front.

export type WarpLogLine = {
  t: number;            // ms since page load (performance.now())
  phase: string;        // current phase at write time
  msg: string;
};

const MAX_LINES = 500;
const lines: WarpLogLine[] = [];
const listeners = new Set<() => void>();
let currentPhase = 'init';

export function setWarpLogPhase(phase: string): void {
  currentPhase = phase;
}

export function warpLog(msg: string): void {
  const line: WarpLogLine = {
    t: performance.now(),
    phase: currentPhase,
    msg,
  };
  lines.push(line);
  if (lines.length > MAX_LINES) lines.shift();
  for (const fn of listeners) {
    try { fn(); } catch { /* swallow */ }
  }
  // Mirror to console so the browser devtools also see it. Prefixed
  // so it's easy to filter.
  console.log(`[warp/${currentPhase}] ${msg}`);
}

export function getWarpLogs(): WarpLogLine[] {
  return lines.slice();
}

export function subscribeWarpLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function formatWarpLogs(): string {
  return lines
    .map((l) => `${(l.t / 1000).toFixed(2)}s [${l.phase}] ${l.msg}`)
    .join('\n');
}

export async function copyWarpLogs(): Promise<boolean> {
  const text = formatWarpLogs();
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('[warpLog] clipboard write failed:', err);
    return false;
  }
}

// ── live stats published by the scene each frame ──
// Separate map so the HUD can render high-frequency numbers without
// the log buffer growing.

type StatsMap = Record<string, string | number>;
const stats: StatsMap = {};
const statsListeners = new Set<() => void>();

export function publishWarpStat(key: string, value: string | number): void {
  if (stats[key] === value) return;
  stats[key] = value;
  for (const fn of statsListeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

export function getWarpStats(): StatsMap {
  return { ...stats };
}

export function subscribeWarpStats(fn: () => void): () => void {
  statsListeners.add(fn);
  return () => { statsListeners.delete(fn); };
}

export function clearWarpStat(key: string): void {
  if (!(key in stats)) return;
  delete stats[key];
  for (const fn of statsListeners) {
    try { fn(); } catch { /* swallow */ }
  }
}
