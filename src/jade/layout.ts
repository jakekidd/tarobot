// Graph layout for the Jade scene. Deterministic — same tree always lays
// out the same way, so the friend can re-find a node she was just looking
// at after an edit. Cheap force-directed pass with seeded initial
// positions: openers in a row at the top, roots arranged in a wide ring
// below, leaf followups hung off their parents.

import type { DialogueTree } from '../pipeline/survey';

export type NodePos = {
  id: string;
  x: number;
  y: number;
  /** Categorization for color: 'opener' | 'root' | 'followup' */
  kind: 'opener' | 'root' | 'followup';
};

export type Edge = {
  from: string;
  to: string;
  /** 'next' = default followup, 'answer' = per-answer override */
  via: 'next' | 'answer';
};

export type Layout = {
  nodes: Map<string, NodePos>;
  edges: Edge[];
  /** Bounding box of all nodes — used by the scene to fit the camera. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

const ROOT_RADIUS = 7.0;
const OPENER_Y = 9.0;
const OPENER_SPACING = 2.4;
const FOLLOWUP_OFFSET = 1.6;

export function layoutTree(tree: DialogueTree): Layout {
  const nodes = new Map<string, NodePos>();
  const edges: Edge[] = [];

  // 1. Openers — horizontal row at top, centered.
  const openers = tree.openers;
  const openerWidth = (openers.length - 1) * OPENER_SPACING;
  openers.forEach((id, i) => {
    if (!tree.nodes[id]) return;
    nodes.set(id, {
      id,
      x: i * OPENER_SPACING - openerWidth / 2,
      y: OPENER_Y,
      kind: 'opener',
    });
  });

  // 2. Roots — distributed around a circle below. Skip any that are
  //    already placed as openers.
  const rootsToPlace = tree.roots.filter((id) => !nodes.has(id) && tree.nodes[id]);
  rootsToPlace.forEach((id, i) => {
    const angle = (i / rootsToPlace.length) * Math.PI * 2 - Math.PI / 2;
    nodes.set(id, {
      id,
      x: Math.cos(angle) * ROOT_RADIUS,
      y: Math.sin(angle) * ROOT_RADIUS,
      kind: 'root',
    });
  });

  // 3. Followups — nodes that exist but aren't openers or roots. Anchor
  //    each near its primary parent (a node that points to it via `next`
  //    or an answer override).
  const placed = new Set(nodes.keys());
  const remaining = Object.keys(tree.nodes).filter((id) => !placed.has(id));
  for (const id of remaining) {
    const parent = findParent(tree, id);
    const parentPos = parent ? nodes.get(parent) : null;
    if (parent && parentPos) {
      // Spiral around the parent so multiple followups don't overlap.
      const existingChildren = countPlacedChildren(tree, parent, placed);
      const angle = (existingChildren / Math.max(3, existingChildren + 1)) * Math.PI * 2;
      nodes.set(id, {
        id,
        x: parentPos.x + Math.cos(angle) * FOLLOWUP_OFFSET,
        y: parentPos.y + Math.sin(angle) * FOLLOWUP_OFFSET,
        kind: 'followup',
      });
    } else {
      // Orphan — drop somewhere out of the way.
      nodes.set(id, { id, x: -ROOT_RADIUS * 1.8, y: -OPENER_Y, kind: 'followup' });
    }
    placed.add(id);
  }

  // 4. Soft repulsion pass — push overlapping nodes apart a touch.
  //    A handful of passes is enough; we're not after physics, just
  //    legibility.
  const list = Array.from(nodes.values());
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 1.35;
        if (d2 < min * min && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.4;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * push * 0.5;
          a.y -= uy * push * 0.5;
          b.x += ux * push * 0.5;
          b.y += uy * push * 0.5;
        }
      }
    }
  }

  // 5. Edges — walk every node's `next` and per-answer overrides.
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (node.next && nodes.has(node.next)) {
      edges.push({ from: id, to: node.next, via: 'next' });
    }
    if (node.a) {
      for (const tuple of node.a) {
        const override = tuple[2];
        if (override && nodes.has(override)) {
          edges.push({ from: id, to: override, via: 'answer' });
        }
      }
    }
  }

  // 6. Bounds.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes.values()) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  return { nodes, edges, bounds: { minX, maxX, minY, maxY } };
}

function findParent(tree: DialogueTree, child: string): string | null {
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (node.next === child) return id;
    if (node.a) {
      for (const tuple of node.a) {
        if (tuple[2] === child) return id;
      }
    }
  }
  return null;
}

function countPlacedChildren(
  tree: DialogueTree,
  parent: string,
  placed: Set<string>,
): number {
  const node = tree.nodes[parent];
  if (!node) return 0;
  let n = 0;
  if (node.next && placed.has(node.next)) n++;
  if (node.a) {
    for (const tuple of node.a) {
      if (tuple[2] && placed.has(tuple[2])) n++;
    }
  }
  return n;
}
