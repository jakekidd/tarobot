// Pub/sub for profiler agent activity. Distinct from the anchorBus
// (which carries the committed output): this bus carries the SCRATCH
// — trigger reason, tier in use, suspicions diff. The ProfilerWorkspace
// component renders the latest event in the top region of the left
// debug column.

import type { ProfilerTrigger } from '../pipeline/survey';

export type ProfilerActivityEvent = {
  /** Wall-clock turn the pass ran on (post-opener count). */
  turn: number;
  /** Why the profiler ran. */
  trigger: ProfilerTrigger;
  /** Model tier the profiler used this pass. */
  tier: 'fast' | 'cognition' | 'deep';
  /** Suspicions added to the fenced section this pass. */
  suspicions_raised: string[];
  /** Suspicions removed (refuted or absorbed into a confirmed read). */
  suspicions_dropped: string[];
  /** Optional 1-2 sentence reasoning the profiler returned. */
  reasoning?: string;
  /** True if the apply was discarded as stale (engine had moved on). */
  stale?: boolean;
};

const EVENT_CAP = 20;

type Listener = (events: readonly ProfilerActivityEvent[]) => void;

const events: ProfilerActivityEvent[] = [];
const listeners = new Set<Listener>();

export function publishProfilerActivity(event: ProfilerActivityEvent): void {
  events.push(event);
  while (events.length > EVENT_CAP) events.shift();
  for (const fn of listeners) {
    try { fn(events.slice()); } catch { /* swallow */ }
  }
}

export function subscribeProfilerActivity(fn: Listener): () => void {
  listeners.add(fn);
  try { fn(events.slice()); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}

export function getProfilerActivity(): readonly ProfilerActivityEvent[] {
  return events;
}

export function clearProfilerActivity(): void {
  events.length = 0;
  for (const fn of listeners) {
    try { fn([]); } catch { /* swallow */ }
  }
}
