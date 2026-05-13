// Fire-and-subscribe bus for "Clat reaction" impact events. When the user
// taps a multiple-choice option, the survey/tent calls fireImpact() and the
// TarobotScene spawns a glowing sphere dot at Clat's position.

export type Impact = {
  /** 0..1 — used as a multiplier on size/brightness. Default 1. */
  strength?: number;
};

type Listener = (impact: Impact) => void;
const listeners = new Set<Listener>();

export function fireImpact(impact: Impact = {}): void {
  listeners.forEach((fn) => fn(impact));
}

export function subscribeImpacts(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
