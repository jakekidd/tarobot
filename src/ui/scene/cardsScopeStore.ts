// Phase-scope for the orbiting-cards subsystem. The TarobotScene is
// global (mounted in App), but the cards should only exist while the
// user is in the antechamber — they were showing up on the Pipeline page and
// every other screen and never going away.
//
// Antechamber mounts → setCardsActive(true); unmounts → setCardsActive(false).
// orbitingCards reads this on spawn (ignores spawns when inactive) and
// subscribes to fade-out existing cards when scope goes inactive.

type Listener = (active: boolean) => void;
const listeners = new Set<Listener>();
let active = false;

export function setCardsActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const fn of listeners) fn(active);
}

export function getCardsActive(): boolean {
  return active;
}

export function subscribeCardsActive(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
