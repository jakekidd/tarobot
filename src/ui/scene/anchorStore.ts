// Shared state for "where on screen should the cat render right now?"
//
// React layer publishes Anchor objects via setAnchor(); the Three.js
// scene polls getAnchor() each frame. Decoupled from React's reactivity
// — the scene doesn't re-mount when anchors change.

export type Anchor = {
  /** Centre of the anchor in viewport pixels (window-relative). */
  x: number;
  y: number;
  /** Anchor box dimensions in viewport pixels. */
  width: number;
  height: number;
};

let current: Anchor | null = null;

export function setAnchor(a: Anchor | null): void {
  current = a;
}

export function getAnchor(): Anchor | null {
  return current;
}
