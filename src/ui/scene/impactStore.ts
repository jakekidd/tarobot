// Fire-and-subscribe bus for "data orb" spawns. When the user taps a survey
// or tent multi-choice option, the button fires an Impact carrying the click
// coordinates. The TarobotScene spawns a glowing orb at that point which
// floats up to a drifting cloud above/behind the cat — a visual answer counter.

export type Impact = {
  /** Click coordinates in viewport (client) pixels. */
  x: number;
  y: number;
  /** True if the user passed on this question rather than answering. The
   *  orbiting-cards system renders pass impacts as silver/gray; answers
   *  render as gold. Default false → gold. */
  passed?: boolean;
};

type Listener = (impact: Impact) => void;
const listeners = new Set<Listener>();

export function fireImpact(impact: Impact): void {
  listeners.forEach((fn) => fn(impact));
}

export function subscribeImpacts(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
