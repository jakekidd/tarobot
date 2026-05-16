// Canvas painters for tarot card faces. Each card gets two textures:
// front (numeral + glyph + label) and back (dark pattern). Drawn once
// per card on first request, cached. Used by the WebGL card meshes in
// TableScene.

import * as THREE from 'three';
import type { Card } from '../../pipeline';
import { glyphFor, labelFor, numeralFor } from './glyphs';

const TEX_W = 512;
const TEX_H = 768;

const BG = '#0f0820';
const BORDER = '#7c3aed';
const INK = '#d6c9ff';
const GLYPH = '#b388ff';

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
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Outer border
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 6;
  roundRect(ctx, 18, 18, TEX_W - 36, TEX_H - 36, 16);
  ctx.stroke();

  // Inner border for that classic tarot frame
  ctx.strokeStyle = BORDER;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  roundRect(ctx, 44, 44, TEX_W - 88, TEX_H - 88, 10);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Numeral, top-left
  ctx.fillStyle = INK;
  ctx.font = '300 64px "Times New Roman", serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(numeralFor(card), 70, 70);

  // Mirrored numeral, bottom-right (rotated 180°)
  ctx.save();
  ctx.translate(TEX_W - 70, TEX_H - 70);
  ctx.rotate(Math.PI);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(numeralFor(card), 0, 0);
  ctx.restore();

  // Big centre emoji
  ctx.font = '260px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyphFor(card), TEX_W / 2, TEX_H / 2 - 10);

  // Label, bottom centre
  ctx.fillStyle = INK;
  ctx.font = '300 italic 36px "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(labelFor(card), TEX_W / 2, TEX_H - 88);
}

function paintBack(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BG;
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
