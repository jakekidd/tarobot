// "Dizzy" — the visual loading state. Fires when the survey is waiting on
// an LLM call (Investigator typing in the background, Compiler running, etc.).
// Visually: Clat's eyes spin through the 8 look-directions; the purple dust
// ramps clockwise to ~10× speed, holds while dizzy, then brakes back to
// baseline. Slow ramp-up, fast brake.
//
// Same pub/sub pattern as impactStore — engine.ts sets, scene subscribes.

type DizzyListener = (dizzy: boolean) => void;

let current = false;
const listeners = new Set<DizzyListener>();

export function setDizzy(value: boolean): void {
  if (current === value) return;
  current = value;
  for (const fn of listeners) {
    try { fn(current); } catch { /* swallow */ }
  }
}

export function getDizzy(): boolean {
  return current;
}

export function subscribeDizzy(fn: DizzyListener): () => void {
  listeners.add(fn);
  // Fire current value on subscribe so late subscribers sync up.
  try { fn(current); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}
