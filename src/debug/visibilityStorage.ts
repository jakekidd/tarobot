// Persistence for the debug overlay visibility toggle. Split into its own
// module so Debug.tsx stays component-only (avoids the react-refresh
// "shared exports" warning).
//
// Also exposes a subscriber API so non-React modules (the three.js
// scene) can show/hide debug-only meshes when the chip is toggled.

const VISIBLE_KEY = 'tarobot:debug:visible';

let visible: boolean = (() => {
  try { return localStorage.getItem(VISIBLE_KEY) === '1'; } catch { return false; }
})();

type Listener = (v: boolean) => void;
const listeners = new Set<Listener>();

export function loadDebugVisible(): boolean {
  return visible;
}

export function saveDebugVisible(v: boolean): void {
  if (visible === v) return;
  visible = v;
  try {
    localStorage.setItem(VISIBLE_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  for (const fn of listeners) {
    try { fn(visible); } catch { /* swallow */ }
  }
}

export function subscribeDebugVisible(fn: Listener): () => void {
  listeners.add(fn);
  try { fn(visible); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}
