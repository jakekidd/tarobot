// Which face the TarobotScene shows at the ReaderAnchor.
//
//   'cat'   — Clat sprite (default; menu, survey)
//   'eyes'  — two glowing eyes (the seer; reading)
//   'hidden'— nothing rendered at the anchor (transitional, screensavers)
//
// Same pub/sub shape as dizzyStore. Reading.tsx sets 'eyes' on mount,
// restores 'cat' on unmount.

export type ReaderMode = 'cat' | 'eyes' | 'hidden';

type Listener = (mode: ReaderMode) => void;

let current: ReaderMode = 'cat';
const listeners = new Set<Listener>();

export function setReaderMode(mode: ReaderMode): void {
  if (current === mode) return;
  current = mode;
  for (const fn of listeners) {
    try { fn(current); } catch { /* swallow */ }
  }
}

export function getReaderMode(): ReaderMode {
  return current;
}

export function subscribeReaderMode(fn: Listener): () => void {
  listeners.add(fn);
  try { fn(current); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}
