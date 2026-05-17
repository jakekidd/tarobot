// Camera fly-in coordinator. Triggered by Reading on mount; consumed
// by TarobotScene which overrides the perspective-camera position
// while active. The scene calls `endFlyIn()` itself when the
// interpolation completes; Reading watches the store so it can hand
// off to the existing intro flow.
//
// Kept dead simple — no React, no context. One bool + a start time.

export type FlyInState = {
  active: boolean;
  startTime: number;
  durationMs: number;
};

const DEFAULT_DURATION_MS = 3500;

let current: FlyInState = {
  active: false,
  startTime: 0,
  durationMs: DEFAULT_DURATION_MS,
};
const listeners = new Set<(s: FlyInState) => void>();

function emit() {
  for (const fn of listeners) {
    try { fn(current); } catch { /* swallow */ }
  }
}

export function startFlyIn(durationMs: number = DEFAULT_DURATION_MS): void {
  current = { active: true, startTime: performance.now(), durationMs };
  emit();
}

export function endFlyIn(): void {
  if (!current.active) return;
  current = { ...current, active: false };
  emit();
}

export function getFlyInState(): FlyInState {
  return current;
}

export function subscribeFlyIn(fn: (s: FlyInState) => void): () => void {
  listeners.add(fn);
  try { fn(current); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}
