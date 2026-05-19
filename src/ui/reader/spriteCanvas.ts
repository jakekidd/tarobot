// Renders a claude-cat sprite frame onto a canvas as a 1-bit (fg-on-bg)
// block image. Each cell is 2x2 quadrant-pixels; hex digit selects which
// quadrants are filled.

type FrameRow = string;
export type SpriteFrame = FrameRow[];

/**
 * Quadrant fill mapping per hex digit:
 *   bit 0 (0x1) = bottom-right
 *   bit 1 (0x2) = bottom-left
 *   bit 2 (0x4) = top-right
 *   bit 3 (0x8) = top-left
 *
 * 'I' (inverse) = full cell.
 * 'F' = full cell.
 * '0' = empty.
 */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  fg: string,
  _bg: string,           // accepted for API compatibility; ignored — bg is transparent
  scale = 8,
): void {
  const cols = frame[0]?.length ?? 0;
  const rows = frame.length;
  const cellPx = 2 * scale;             // each cell is a 2x2 quadrant block
  const quadPx = scale;
  // Transparent padding around the sprite so the textured plane's outer edges
  // never sample a non-zero alpha pixel. Without this, sprite content at row 0,
  // row N-1, col 0, or col M-1 paints a thin rectangular outline along the
  // plane's silhouette (a "box around the cat") that follows the cat's rotation.
  const padPx = quadPx;
  const w = cols * cellPx + 2 * padPx;
  const h = rows * cellPx + 2 * padPx;
  ctx.canvas.width = w;
  ctx.canvas.height = h;

  // Setting canvas.width/height resets the 2D context state — re-apply the
  // crisp-pixels flag and clear to fully transparent.
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = fg;

  for (let r = 0; r < rows; r++) {
    const line = frame[r]!;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]!.toUpperCase();
      const x = c * cellPx + padPx;
      const y = r * cellPx + padPx;
      if (ch === '0') continue;
      if (ch === 'I' || ch === 'F') {
        ctx.fillRect(x, y, cellPx, cellPx);
        continue;
      }
      const hex = parseInt(ch, 16);
      if (Number.isNaN(hex)) continue;
      if (hex & 0x8) ctx.fillRect(x,           y,           quadPx, quadPx); // TL
      if (hex & 0x4) ctx.fillRect(x + quadPx,  y,           quadPx, quadPx); // TR
      if (hex & 0x2) ctx.fillRect(x,           y + quadPx,  quadPx, quadPx); // BL
      if (hex & 0x1) ctx.fillRect(x + quadPx,  y + quadPx,  quadPx, quadPx); // BR
    }
  }
}
