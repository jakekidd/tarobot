// Pulse store — pub/sub for ambient "AI returned" pulses propagating
// through the star field. Mascots fire pulses via firePulse(); the
// scene subscribes to update star material uniforms + play the wooom.
//
// Naming note: the user called these "beacons" first, then we settled
// on "pulse" — a gentle heartbeat-shaped wave. Same thing.

export type Pulse = {
  /** Scene-relative seconds at which the pulse started. */
  startTime: number;
  /** World-space XY origin (ortho scene). Stars near this point
   *  feel the wave first. */
  origin: { x: number; y: number };
  /** Tint RGB 0..1. Mascot owns the agent→color mapping. */
  color: [number, number, number];
  /** 0..1 — amplitude of the displacement / glow envelope. */
  intensity: number;
};

type Listener = (pulse: Pulse) => void;
const listeners = new Set<Listener>();

export function firePulse(p: Pulse): void {
  for (const fn of listeners) {
    try { fn(p); } catch { /* swallow */ }
  }
}

export function subscribePulse(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
