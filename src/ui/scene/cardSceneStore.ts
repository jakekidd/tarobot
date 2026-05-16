// Card-scene state bus. Reading.tsx publishes drawn cards, per-slot
// stages, and pickability here; TarobotScene's perspective layer
// subscribes and drives the meshes accordingly.

import type { DrawnCards } from '../../pipeline';

export type SlotName = 'top' | 'left' | 'right' | 'bottom';
export type CardStage = 'face_down' | 'face_up' | 'lifted';

export type CardSceneState = {
  drawn: DrawnCards | null;
  stages: Partial<Record<SlotName, CardStage>>;
  pickable: boolean;
};

type Listener = (s: CardSceneState) => void;

let current: CardSceneState = { drawn: null, stages: {}, pickable: false };
const listeners = new Set<Listener>();

export function setCardScene(next: Partial<CardSceneState>): void {
  current = { ...current, ...next };
  for (const fn of listeners) {
    try { fn(current); } catch { /* swallow */ }
  }
}

export function getCardScene(): CardSceneState {
  return current;
}

export function subscribeCardScene(fn: Listener): () => void {
  listeners.add(fn);
  try { fn(current); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}
