// Canvas painters for tarot card faces. Each card gets two textures:
// front (numeral + glyph + label) and back (dark pattern). Drawn once
// per card on first request, cached. Used by the WebGL card meshes in
// TableScene.

import * as THREE from 'three';
import type { Card } from '../../pipeline';
import { glyphFor, numeralFor } from './glyphs';
import { drawSuitSymbol, pipLayout, type SuitName } from './suitSymbols';

const TEX_W = 512;
const TEX_H = 768;

// Inverted color scheme: dark outer frame, pale inner panel, dark
// numerals + dark emoji silhouette. Reads like a real printed tarot
// card — cyan-on-cyan, but the values flip between frame and panel.
const FRAME = '#04141a';     // very dark teal — outer + ink color
const BORDER = '#22d3ee';    // turquoise frame line
const PANEL = '#e6fdff';     // near-white pale cyan — the card's "paper"
const INK = '#0e2a33';       // very dark teal — numerals + silhouette
const GLYPH = '#67e8f9';     // bright turquoise — back-of-card accent only

const faceCache = new Map<number, THREE.CanvasTexture>();
let backTexture: THREE.CanvasTexture | null = null;

export function cardFaceTexture(card: Card): THREE.CanvasTexture {
  const cached = faceCache.get(card.id);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  paintFace(ctx, card);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  faceCache.set(card.id, tex);
  return tex;
}

export function cardBackTexture(): THREE.CanvasTexture {
  if (backTexture) return backTexture;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  paintBack(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  backTexture = tex;
  return tex;
}

function paintFace(ctx: CanvasRenderingContext2D, card: Card): void {
  // Outer dark frame
  ctx.fillStyle = FRAME;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Outer border line
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 6;
  roundRect(ctx, 18, 18, TEX_W - 36, TEX_H - 36, 16);
  ctx.stroke();

  // Pale inner panel — the card's "paper". Filled, not just outlined.
  const panelX = 44;
  const panelY = 44;
  const panelW = TEX_W - 88;
  const panelH = TEX_H - 88;
  ctx.fillStyle = PANEL;
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.fill();

  // Inner border line — turquoise, on the pale panel
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.stroke();

  // Numerals — Cinzel display serif, dark ink on the pale panel.
  ctx.fillStyle = INK;
  ctx.font = '800 78px "Cinzel", "IM Fell English", serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(numeralFor(card), 76, 76);

  // Mirrored numeral, bottom-right (rotated 180°)
  ctx.save();
  ctx.translate(TEX_W - 76, TEX_H - 76);
  ctx.rotate(Math.PI);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(numeralFor(card), 0, 0);
  ctx.restore();

  // Centre artwork — three distinct paths.
  if (card.arcana === 'minor' && card.suit && card.number !== undefined) {
    const n = card.number;
    if (n >= 1 && n <= 10) {
      paintPipFace(ctx, card.suit as SuitName, n);
    } else if (n >= 11 && n <= 14) {
      paintCourtFace(ctx, card.suit as SuitName, n);
    }
  } else {
    paintMajorFace(ctx, card);
  }
  // (label intentionally omitted — card name lives in the subtitle below the table)
}

/** Pip card (1-10): N suit symbols laid out in a symmetric pattern.
 *  Symbols stroked in dark INK on the pale panel — readable, line-art
 *  feel. Sizes scale with N so 10 symbols pack without crowding. */
function paintPipFace(ctx: CanvasRenderingContext2D, suit: SuitName, n: number): void {
  // Available area for the pip grid — inside the panel, with breathing
  // room around the numerals at the corners.
  const areaLeft = 110;
  const areaRight = TEX_W - 110;
  const areaTop = 180;
  const areaBottom = TEX_H - 180;
  const areaW = areaRight - areaLeft;
  const areaH = areaBottom - areaTop;
  const cx0 = (areaLeft + areaRight) / 2;
  const cy0 = (areaTop + areaBottom) / 2;
  // Symbol size shrinks as N grows so they don't crowd.
  const sizeByN: Record<number, number> = {
    1: 280, 2: 200, 3: 175, 4: 165,
    5: 155, 6: 145, 7: 130, 8: 130,
    9: 120, 10: 105,
  };
  const size = sizeByN[n] ?? 130;
  for (const [nx, ny] of pipLayout(n)) {
    const px = cx0 + nx * (areaW / 2);
    const py = cy0 + ny * (areaH / 2);
    drawSuitSymbol(ctx, suit, px, py, size, INK);
  }
}

/** Court card (page=11, knight=12, queen=13, king=14): one big suit
 *  symbol with a small rank emblem above it. Roman/letter rank in the
 *  corners already covers numbering; this is centerpiece artwork. */
function paintCourtFace(ctx: CanvasRenderingContext2D, suit: SuitName, n: number): void {
  drawSuitSymbol(ctx, suit, TEX_W / 2, TEX_H / 2 + 30, 330, INK);
  // Small rank glyph above the suit — drawn as text since court ranks
  // map cleanly to a single character.
  const rank = n === 11 ? 'P' : n === 12 ? 'N' : n === 13 ? 'Q' : 'K';
  ctx.fillStyle = INK;
  ctx.font = '700 56px "Cinzel", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank, TEX_W / 2, TEX_H / 2 - 200);
}

/** Major Arcana: emoji silhouette, but with a softer filter so detail
 *  doesn't collapse. Source-in tints the silhouette to INK; the
 *  grayscale+contrast pass is dropped entirely (it was destroying the
 *  fine details of crossed-swords / chariot / wheel emoji etc.). */
function paintMajorFace(ctx: CanvasRenderingContext2D, card: Card): void {
  const off = document.createElement('canvas');
  off.width = TEX_W;
  off.height = TEX_H;
  const offCtx = off.getContext('2d')!;
  offCtx.font = '260px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
  offCtx.textAlign = 'center';
  offCtx.textBaseline = 'middle';
  offCtx.fillText(glyphFor(card), TEX_W / 2, TEX_H / 2 - 10);
  // source-in masks the INK fill by the emoji's alpha → keeps shape,
  // discards the OS-rendered colored pixels.
  offCtx.globalCompositeOperation = 'source-in';
  offCtx.fillStyle = INK;
  offCtx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.drawImage(off, 0, 0);
}

function paintBack(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = FRAME;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Outer border
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 6;
  roundRect(ctx, 18, 18, TEX_W - 36, TEX_H - 36, 16);
  ctx.stroke();

  // Diamond grid pattern
  ctx.strokeStyle = BORDER;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 1.5;
  const step = 56;
  const cx = TEX_W / 2;
  const cy = TEX_H / 2;
  for (let r = step; r < TEX_W; r += step) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Centre star glyph for ornament — kept unicode (geometric) so the back
  // pattern doesn't compete with the front's color emoji.
  ctx.fillStyle = GLYPH;
  ctx.globalAlpha = 0.85;
  ctx.font = '160px "Segoe UI Symbol", "DejaVu Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦', cx, cy);
  ctx.globalAlpha = 1;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function disposeCardTextures(): void {
  for (const t of faceCache.values()) t.dispose();
  faceCache.clear();
  if (backTexture) {
    backTexture.dispose();
    backTexture = null;
  }
}
