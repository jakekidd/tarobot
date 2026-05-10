import * as THREE from 'three';
import type { Card } from '../../pipeline';

const TEX_W = 256;
const TEX_H = 410;        // ~playing card aspect (1:1.6)
const FG = '#e8d9ff';
const ACCENT = '#d4a64a';
const ACCENT_DIM = 'rgba(212, 166, 74, 0.6)';
const BG = '#0d0716';

let cachedBack: THREE.CanvasTexture | null = null;
const cachedFronts = new Map<number, THREE.CanvasTexture>();

/** Decorative back-of-card texture. One shared instance — every card uses it. */
export function getCardBackTexture(): THREE.CanvasTexture {
  if (cachedBack) return cachedBack;

  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const ctx = c.getContext('2d')!;

  // background gradient
  const grad = ctx.createRadialGradient(
    TEX_W / 2, TEX_H / 2, 20,
    TEX_W / 2, TEX_H / 2, TEX_W * 0.8,
  );
  grad.addColorStop(0, '#2a1d44');
  grad.addColorStop(1, '#0a0612');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // gold border
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, TEX_W - 20, TEX_H - 20);

  // inner border (thin)
  ctx.strokeStyle = ACCENT_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, TEX_W - 40, TEX_H - 40);

  // central star/sun motif
  const cx = TEX_W / 2;
  const cy = TEX_H / 2;
  ctx.strokeStyle = ACCENT_DIM;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
  }
  ctx.stroke();

  // hub
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();

  // crescent moon cut into hub
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.arc(cx + 4, cy - 2, 9, 0, Math.PI * 2);
  ctx.fill();

  cachedBack = new THREE.CanvasTexture(c);
  cachedBack.colorSpace = THREE.SRGBColorSpace;
  cachedBack.anisotropy = 4;
  return cachedBack;
}

const SUIT_SYMBOL: Record<string, string> = {
  cups: '♥',
  wands: '⚚',
  swords: '⚔',
  pentacles: '✪',
};

/** Card-face texture: just the name (and suit/numeral) for MVP. */
export function getCardFrontTexture(card: Card): THREE.CanvasTexture {
  const cached = cachedFronts.get(card.id);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const ctx = c.getContext('2d')!;

  // background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // outer border
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, TEX_W - 20, TEX_H - 20);

  // inner border
  ctx.strokeStyle = ACCENT_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, TEX_W - 40, TEX_H - 40);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // top sigil — roman numeral for major, suit symbol for minor
  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 56px "Times New Roman", serif';
  if (card.arcana === 'major') {
    ctx.fillText(toRoman(card.number ?? 0), TEX_W / 2, 100);
  } else {
    const sym = SUIT_SYMBOL[card.suit ?? ''] ?? '·';
    ctx.fillText(sym, TEX_W / 2, 100);
  }

  // mid divider
  ctx.strokeStyle = ACCENT_DIM;
  ctx.beginPath();
  ctx.moveTo(50, 165);
  ctx.lineTo(TEX_W - 50, 165);
  ctx.stroke();

  // card name (wrapped)
  ctx.fillStyle = FG;
  ctx.font = '22px "Times New Roman", serif';
  drawWrappedCentered(ctx, card.name, TEX_W / 2, 220, TEX_W - 60, 28);

  // bottom keyword
  if (card.keywords.length > 0) {
    ctx.fillStyle = ACCENT_DIM;
    ctx.font = 'italic 16px "Times New Roman", serif';
    ctx.fillText(card.keywords[0]!, TEX_W / 2, TEX_H - 60);
  }

  // suit / number tag corners
  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${card.id}`, 28, 36);
  ctx.textAlign = 'right';
  if (card.arcana === 'minor' && card.number) {
    ctx.fillText(`${card.number}`, TEX_W - 28, TEX_H - 28);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedFronts.set(card.id, tex);
  return tex;
}

function drawWrappedCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  yStart: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, x, yStart + i * lineHeight);
  }
}

function toRoman(n: number): string {
  if (n === 0) return '0';
  const map: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'],  [90, 'XC'],  [50, 'L'],  [40, 'XL'],
    [10, 'X'],   [9, 'IX'],   [5, 'V'],   [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}
