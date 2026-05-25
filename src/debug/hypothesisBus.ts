// Pub/sub for the curated hypothesis list snapshot. The engine
// publishes after every profiler apply (or seeder add); the
// HypothesisView component subscribes and re-renders.
//
// Carries: the full list snapshot, the just-raised ids, and the
// just-dropped ids — for the diff flash + change badges.

import type { Probe } from '../pipeline/survey';

export type HypothesisSnapshot = {
  /** Post-opener turn the snapshot was taken on. */
  turn: number;
  /** Full hypothesis list (doc.held). */
  list: readonly Probe[];
  /** Ids changed by the most recent profiler pass (added or promoted). */
  raised_ids: readonly string[];
  /** Ids dropped or refuted by the most recent profiler pass. */
  dropped_ids: readonly string[];
};

type Listener = (snapshot: HypothesisSnapshot) => void;

let last: HypothesisSnapshot | null = null;
const listeners = new Set<Listener>();

export function publishHypotheses(snapshot: HypothesisSnapshot): void {
  last = snapshot;
  for (const fn of listeners) {
    try { fn(snapshot); } catch { /* swallow */ }
  }
}

export function subscribeHypotheses(fn: Listener): () => void {
  listeners.add(fn);
  if (last) {
    try { fn(last); } catch { /* swallow */ }
  }
  return () => { listeners.delete(fn); };
}

export function getLastHypotheses(): HypothesisSnapshot | null {
  return last;
}

export function clearHypotheses(): void {
  last = null;
  for (const fn of listeners) {
    try {
      fn({ turn: 0, list: [], raised_ids: [], dropped_ids: [] });
    } catch { /* swallow */ }
  }
}
