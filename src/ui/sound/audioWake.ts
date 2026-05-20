// Centralized audio-wake state. Browsers block all audio (Web Audio +
// HTMLAudioElement.play()) until the first user gesture on the page.
// Before this module existed, every audio consumer attached its own
// gesture listener — which meant the menu's kalimba had a listener, the
// SFX module had ITS listener, and you ended up with races where one
// wake fired and the others missed it.
//
// Single source of truth now: attachGestureGuard (sound.ts) is the only
// gesture catcher. It calls fireAudioWake() on first wake. Anyone who
// wants to do audio things on/after first gesture subscribes via
// onAudioWake() (fires immediately if already woken, otherwise queued).
//
// The "waiting" state drives a small visual indicator (AudioWakeBadge)
// so the user can see audio is pending and tap to enable it — fixes the
// "have to go to Settings and back for sfx to work" UX.

type WakeListener = () => void;

const listeners = new Set<WakeListener>();
const stateListeners = new Set<(woken: boolean) => void>();
let woken = false;

export function hasAudioWoken(): boolean {
  return woken;
}

/** Subscribe to the "audio is now allowed" event. If already woken, the
 *  callback fires immediately on the next microtask. Otherwise it joins
 *  the queue and fires (once) at first user gesture. Returns an
 *  unsubscribe handle for cleanup-on-unmount. */
export function onAudioWake(fn: WakeListener): () => void {
  if (woken) {
    queueMicrotask(fn);
    return () => { /* no-op: already fired */ };
  }
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Subscribe to state-change events (woken: false → true). For UI bits
 *  that need to track the boolean state, not just trigger once at wake. */
export function subscribeAudioWakeState(fn: (woken: boolean) => void): () => void {
  stateListeners.add(fn);
  return () => { stateListeners.delete(fn); };
}

/** Called by sound.ts's gesture guard on first interaction. Idempotent. */
export function fireAudioWake(): void {
  if (woken) return;
  woken = true;
  for (const fn of listeners) {
    try { fn(); } catch { /* listener crash isolated */ }
  }
  listeners.clear();
  for (const fn of stateListeners) {
    try { fn(true); } catch { /* same */ }
  }
}
