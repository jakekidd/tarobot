// Hand-drawn Path2D suit symbols. Replaces the previous emoji-with-
// grayscale-filter approach which collapsed fine detail (the Six of
// Swords sparkle problem). Each function draws ONE symbol centered
// on (cx, cy) sized to fit inside a `size`-by-`size` bounding box.
//
// All four suits are stroked in INK on the pale panel — no fill —
// so they read like printed line-art. Stroke widths scale with size
// so a 30px symbol on a court card looks the same weight as ten 30px
// symbols on a pip card.

export type SuitName = 'cups' | 'wands' | 'swords' | 'pentacles';

const STROKE_RATIO = 0.06;          // stroke width as fraction of size

export function drawSuitSymbol(
  ctx: CanvasRenderingContext2D,
  suit: SuitName,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * STROKE_RATIO);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (suit) {
    case 'swords':    drawSword(ctx, cx, cy, size); break;
    case 'cups':      drawCup(ctx, cx, cy, size); break;
    case 'wands':     drawWand(ctx, cx, cy, size); break;
    case 'pentacles': drawPentacle(ctx, cx, cy, size); break;
  }
  ctx.restore();
}

/** Vertical sword: pommel disc → grip → cross-guard → tapering blade → point. */
function drawSword(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size;
  const top = cy - s * 0.5;
  const bottom = cy + s * 0.5;
  // Pommel (small filled circle at top)
  ctx.beginPath();
  ctx.arc(cx, top + s * 0.06, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  // Grip
  ctx.beginPath();
  ctx.moveTo(cx, top + s * 0.12);
  ctx.lineTo(cx, top + s * 0.24);
  ctx.stroke();
  // Cross-guard (horizontal line)
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.25, top + s * 0.24);
  ctx.lineTo(cx + s * 0.25, top + s * 0.24);
  ctx.stroke();
  // Blade — two slightly-tapering lines meeting at the point
  const bladeTop = top + s * 0.24;
  const blade = new Path2D();
  blade.moveTo(cx - s * 0.07, bladeTop);
  blade.lineTo(cx - s * 0.04, bottom - s * 0.06);
  blade.lineTo(cx, bottom);
  blade.lineTo(cx + s * 0.04, bottom - s * 0.06);
  blade.lineTo(cx + s * 0.07, bladeTop);
  blade.closePath();
  ctx.stroke(blade);
  // Center fuller line (the groove down the middle of the blade)
  ctx.beginPath();
  ctx.moveTo(cx, bladeTop + s * 0.02);
  ctx.lineTo(cx, bottom - s * 0.10);
  ctx.stroke();
}

/** Chalice: bowl curve → stem → flared foot. */
function drawCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size;
  const top = cy - s * 0.45;
  const bottom = cy + s * 0.5;
  // Bowl — U-curve with a slight rim
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, top);
  ctx.lineTo(cx - s * 0.32, top + s * 0.05);
  ctx.bezierCurveTo(
    cx - s * 0.32, top + s * 0.35,
    cx + s * 0.32, top + s * 0.35,
    cx + s * 0.32, top + s * 0.05,
  );
  ctx.lineTo(cx + s * 0.32, top);
  ctx.stroke();
  // Rim line
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, top + s * 0.06);
  ctx.lineTo(cx + s * 0.32, top + s * 0.06);
  ctx.stroke();
  // Stem
  const bowlBottom = top + s * 0.36;
  ctx.beginPath();
  ctx.moveTo(cx, bowlBottom);
  ctx.lineTo(cx, bottom - s * 0.10);
  ctx.stroke();
  // Foot (small ellipse)
  ctx.beginPath();
  ctx.ellipse(cx, bottom - s * 0.05, s * 0.20, s * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Wand: vertical staff with bands at ends + a leafy sprig at the top. */
function drawWand(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size;
  const top = cy - s * 0.5;
  const bottom = cy + s * 0.5;
  // Main staff
  ctx.beginPath();
  ctx.moveTo(cx, top + s * 0.12);
  ctx.lineTo(cx, bottom - s * 0.04);
  ctx.stroke();
  // Top knob
  ctx.beginPath();
  ctx.arc(cx, top + s * 0.10, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  // Bottom band
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.08, bottom - s * 0.04);
  ctx.lineTo(cx + s * 0.08, bottom - s * 0.04);
  ctx.stroke();
  // Two small leafy sprigs near the top — diagonal little strokes
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, top + s * 0.18);
    ctx.quadraticCurveTo(
      cx + side * s * 0.18, top + s * 0.10,
      cx + side * s * 0.22, top + s * 0.20,
    );
    ctx.stroke();
  }
  // Mid bands (knots) for organic detail
  for (const y of [0.35, 0.65]) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.05, top + s * y);
    ctx.lineTo(cx + s * 0.05, top + s * y);
    ctx.stroke();
  }
}

/** Pentacle: five-pointed star inside a circle. */
function drawPentacle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size;
  const r = s * 0.46;
  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // 5-point star — single continuous path
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    pts.push([cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  ctx.lineTo(pts[2]![0], pts[2]![1]);
  ctx.lineTo(pts[4]![0], pts[4]![1]);
  ctx.lineTo(pts[1]![0], pts[1]![1]);
  ctx.lineTo(pts[3]![0], pts[3]![1]);
  ctx.closePath();
  ctx.stroke();
}

/** Returns N grid positions (-1..1 NDC, columns x rows) for laying out
 *  pip symbols on a card face. Symmetric for traditional reads:
 *  1 → center; 2 → vertical pair; 3 → triangle; 4 → 2x2; 5 → 4 corners
 *  + center; 6 → 2x3; 7 → 2x3 + center; 8 → 2x4; 9 → 3x3; 10 → 3x3 +
 *  top + bottom centers. */
export function pipLayout(n: number): Array<[number, number]> {
  // (x, y) in NDC where (0,0) is center, (+x) right, (+y) down.
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[0, -0.55], [0, 0.55]];
  if (n === 3) return [[0, -0.6], [-0.45, 0.4], [0.45, 0.4]];
  if (n === 4) return [[-0.45, -0.55], [0.45, -0.55], [-0.45, 0.55], [0.45, 0.55]];
  if (n === 5) return [
    [-0.5, -0.6], [0.5, -0.6],
    [0, 0],
    [-0.5, 0.6], [0.5, 0.6],
  ];
  if (n === 6) return [
    [-0.5, -0.7], [0.5, -0.7],
    [-0.5, 0],    [0.5, 0],
    [-0.5, 0.7],  [0.5, 0.7],
  ];
  if (n === 7) return [
    [-0.5, -0.75], [0.5, -0.75],
    [0, -0.4],
    [-0.5, 0.05], [0.5, 0.05],
    [-0.5, 0.75], [0.5, 0.75],
  ];
  if (n === 8) return [
    [-0.5, -0.75], [0.5, -0.75],
    [-0.5, -0.25], [0.5, -0.25],
    [-0.5, 0.25],  [0.5, 0.25],
    [-0.5, 0.75],  [0.5, 0.75],
  ];
  if (n === 9) return [
    [-0.55, -0.75], [0, -0.75], [0.55, -0.75],
    [-0.55, 0],     [0, 0],     [0.55, 0],
    [-0.55, 0.75],  [0, 0.75],  [0.55, 0.75],
  ];
  // 10
  return [
    [0, -0.85],
    [-0.55, -0.5], [0.55, -0.5],
    [-0.55, -0.15], [0.55, -0.15],
    [-0.55, 0.2],  [0.55, 0.2],
    [-0.55, 0.55], [0.55, 0.55],
    [0, 0.85],
  ];
}
