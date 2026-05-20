// Burn-card event bus. Fired by Survey.tsx's undo handler. Consumed by
// the orbiting-cards system, which picks the most recent live card and
// runs it through the fly-up + shatter animation. One event = one burned
// card. Multiple rapid undos burn multiple cards.

type Listener = () => void;
const listeners = new Set<Listener>();

export function fireBurnCard(): void {
  for (const fn of listeners) fn();
}

export function subscribeBurnCard(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
