import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SpriteFrame } from './spriteCanvas';

// Per-face shading on each voxel. Adds faux-light without needing real lights.
// Faces, in BoxGeometry's documented order:
//   +x (right), -x (left), +y (top), -y (bottom), +z (front), -z (back).
type FaceColors = readonly [number, number, number, number, number, number];

// All faces sit at or BELOW the original sprite luminance (#7c3aed) so the
// bloom pass — which is tuned for a sprinkle of bright points (stars, orbs) —
// doesn't blow the cat out into a white beacon. Subtle dark variation around the
// base violet is enough to read as 3D once he tilts.
const DEFAULT_FACE_COLORS: FaceColors = [
  0x5e26b8,   // +x right
  0x5e26b8,   // -x left  (symmetric)
  0x7c3aed,   // +y top   (= base — slight top highlight relative to sides)
  0x3a166a,   // -y bottom (deep shadow)
  0x7c3aed,   // +z front (= base — what he used to be as a sprite)
  0x4a1f88,   // -z back   (darker — recedes)
];

/**
 * Build a coloured BoxGeometry with per-face vertex colours preserved through
 * a subsequent merge. Each face of a BoxGeometry has 4 vertices in a stable
 * order; we assign the same RGB to all 4 vertices of each face.
 */
function makeColoredBox(
  w: number,
  h: number,
  d: number,
  faces: FaceColors,
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, d);
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    const c = new THREE.Color(faces[face]!);
    for (let v = 0; v < 4; v++) {
      const i = (face * 4 + v) * 3;
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
  }
  box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return box;
}

/**
 * Voxelize a sprite frame into a single merged BufferGeometry. Every filled
 * quadrant of every cell becomes one box. The whole mesh fits in a unit cube
 * centred at the origin, so the existing positionGroup scaling (anchor.width)
 * keeps the cat at the same on-screen footprint.
 *
 * Y is flipped during the walk so row 0 of the sprite ends up at the top of
 * the mesh (matching the canvas-painted version).
 */
export function buildVoxelGeometry(
  frame: SpriteFrame,
  depth = 0.18,
  faceColors: FaceColors = DEFAULT_FACE_COLORS,
): THREE.BufferGeometry {
  const rows = frame.length;
  const cols = frame[0]?.length ?? 0;
  if (rows === 0 || cols === 0) {
    return new THREE.BufferGeometry();
  }
  // Cell = 2 quadrants per side; the mesh spans [-0.5, 0.5] on x and y.
  const geoms: THREE.BufferGeometry[] = [];

  function push(qx: number, qy: number, qw: number, qh: number, cellC: number, cellR: number) {
    const xCenter = (cellC + qx + qw / 2) / cols - 0.5;
    const yCenter = 0.5 - (cellR + qy + qh / 2) / rows;
    const w = qw / cols;
    const h = qh / rows;
    const box = makeColoredBox(w, h, depth, faceColors);
    box.translate(xCenter, yCenter, 0);
    geoms.push(box);
  }

  for (let r = 0; r < rows; r++) {
    const line = frame[r]!;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]!.toUpperCase();
      if (ch === '0') continue;
      if (ch === 'I' || ch === 'F') {
        // full cell
        push(0, 0, 2, 2, c, r);
        continue;
      }
      const hex = parseInt(ch, 16);
      if (Number.isNaN(hex)) continue;
      if (hex & 0x8) push(0, 0, 1, 1, c, r); // TL
      if (hex & 0x4) push(1, 0, 1, 1, c, r); // TR
      if (hex & 0x2) push(0, 1, 1, 1, c, r); // BL
      if (hex & 0x1) push(1, 1, 1, 1, c, r); // BR
    }
  }

  if (geoms.length === 0) return new THREE.BufferGeometry();
  // mergeGeometries returns BufferGeometry | null; null only happens when the
  // inputs disagree on attributes — they don't here.
  const merged = mergeGeometries(geoms);
  // Dispose the source boxes; the merged copy is what gets used.
  for (const g of geoms) g.dispose();
  return merged ?? new THREE.BufferGeometry();
}
