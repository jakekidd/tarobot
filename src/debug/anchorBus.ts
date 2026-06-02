// Pub/sub for Subject Anchor writes. The engine's profiler runner
// publishes here on every successful pass; the AnchorView component
// subscribes and re-renders.
//
// Carries the full markdown + the diff vs. the prior anchor so the
// view can flash per-section changes without re-parsing.

import type { AnchorDiff } from '../pipeline/antechamber';

export type AnchorEvent = {
  /** Wall-clock turn the anchor was written on (post-opener count). */
  turn: number;
  /** Why the profiler ran: heartbeat / correction / close. */
  trigger: 'heartbeat' | 'correction' | 'close';
  /** Full markdown anchor as the profiler emitted it. */
  anchor: string;
  /** Per-section diff between the prior anchor and this one. */
  diff: AnchorDiff;
};

type Listener = (event: AnchorEvent) => void;

let last: AnchorEvent | null = null;
const listeners = new Set<Listener>();

export function publishAnchor(event: AnchorEvent): void {
  last = event;
  for (const fn of listeners) {
    try { fn(event); } catch { /* swallow */ }
  }
}

export function subscribeAnchor(fn: Listener): () => void {
  listeners.add(fn);
  if (last) {
    try { fn(last); } catch { /* swallow */ }
  }
  return () => { listeners.delete(fn); };
}

export function getLastAnchor(): AnchorEvent | null {
  return last;
}

export function clearAnchor(): void {
  last = null;
  for (const fn of listeners) {
    try {
      fn({ turn: 0, trigger: 'heartbeat', anchor: '', diff: { changed: [], added: [], removed: [] } });
    } catch { /* swallow */ }
  }
}
