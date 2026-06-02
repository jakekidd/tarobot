// Mascot disintegrate trigger. Fired by Antechamber on the farewell beat
// (after the goodbye dialogue finishes typing). The scene relays the
// trigger to the active mascot's disintegrate() method and reports
// completion back so Antechamber can route into Reading.
//
// No state machine — strictly one-shot per trigger. Antechamber is
// responsible for not firing it twice (it doesn't — farewell substate
// is gate-kept by useState).

type Listener = () => void;

const triggerListeners = new Set<Listener>();
const completeListeners = new Set<Listener>();

export function triggerMascotDisintegrate(): void {
  for (const fn of triggerListeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

export function subscribeMascotDisintegrateTrigger(fn: Listener): () => void {
  triggerListeners.add(fn);
  return () => { triggerListeners.delete(fn); };
}

export function fireMascotDisintegrateComplete(): void {
  for (const fn of completeListeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

export function subscribeMascotDisintegrateComplete(fn: Listener): () => void {
  completeListeners.add(fn);
  return () => { completeListeners.delete(fn); };
}
