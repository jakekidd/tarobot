// DOM bbox of where the 3D table should project to. TableAnchor publishes
// its bounding rect (viewport pixels) each layout change; TarobotScene's
// perspective layer scissors + viewports its render to this rect each
// frame.
//
// Same shape as anchorStore; separate store so the cat anchor and table
// anchor are independent (both active simultaneously during the reading).

export type TableAnchor = {
  /** Top-left in viewport (client) pixels. */
  x: number;
  y: number;
  /** Dimensions in viewport pixels. */
  width: number;
  height: number;
};

let current: TableAnchor | null = null;

export function setTableAnchor(a: TableAnchor | null): void {
  current = a;
}

export function getTableAnchor(): TableAnchor | null {
  return current;
}
