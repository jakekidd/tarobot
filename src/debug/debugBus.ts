// Pub/sub bus for debug telemetry. Anyone can publish a key/value;
// the Debug overlay subscribes once and renders the entire map.
//
// Keep this dead simple — no React, no contexts, no provider. The
// overlay is the only consumer and it polls on RAF so updates feel
// live without each publisher having to throttle.

export type DebugValue = string | number | boolean | null | undefined;

const data = new Map<string, DebugValue>();
const listeners = new Set<() => void>();

export function publishDebug(key: string, value: DebugValue): void {
  if (data.get(key) === value) return;
  data.set(key, value);
  for (const fn of listeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

/** Remove a key entirely (e.g. when a screen unmounts). */
export function clearDebug(key: string): void {
  if (!data.has(key)) return;
  data.delete(key);
  for (const fn of listeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

export function getDebugSnapshot(): Map<string, DebugValue> {
  return new Map(data);
}

export function subscribeDebug(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
