// Pub/sub for "the seer pipeline crashed" state. Reading.tsx publishes
// when state.phase === 'error'; TarobotScene subscribes and switches
// eye rendering to X-eyes mode. Cleared on Reading unmount or recovery.

type Listener = (broken: boolean) => void;

const listeners = new Set<Listener>();
let broken = false;

export function setSeerBroken(next: boolean): void {
  if (broken === next) return;
  broken = next;
  for (const fn of listeners) {
    try { fn(broken); } catch { /* swallow */ }
  }
}

export function getSeerBroken(): boolean {
  return broken;
}

export function subscribeSeerError(fn: Listener): () => void {
  listeners.add(fn);
  try { fn(broken); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}
