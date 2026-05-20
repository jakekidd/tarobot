// Parallax star field — the swirling purple-violet starfield from the
// main app's home/survey scene, simplified for the warp demo.
//
// Behaviour the warp demo needs from this:
//   - Renders as a 2D-ish disc of points behind the action (z back).
//   - External control of spin speed via setSpinMul(mul) — 1.0 = base,
//     0 = stopped (instant), >1 ramps up.
//   - External control of alpha via setAlpha(a) for crossfade
//     in/out at phase transitions.
//   - Stable particle set — no spawn/despawn churn. Each particle has
//     its own per-particle base angular velocity for organic variation.
//
// Palette mirrors the StarStreaks colors so the visual identity carries
// continuously across the crossfade: violet + turquoise + white.

import * as THREE from 'three';

const PARTICLE_COUNT = 260;
const BASE_OMEGA = 0.18;           // rad/sec mean — multiplied by per-particle factor + setSpinMul
const OMEGA_JITTER = 0.45;         // per-particle multiplier varies 0.55..1.45
const RADIUS_INNER_FRAC = 0.10;    // inner ring as fraction of viewport min-dim
const RADIUS_OUTER_FRAC = 0.55;    // outer ring as fraction of viewport min-dim
const Z_DEPTH = -400;              // sit behind the action (camera at +100, near=0.1)
const POINT_SIZE_PX = 1.8;

// Same color buckets as the streaks shader, weighted similarly.
const PALETTE: THREE.Color[] = [
  new THREE.Color(0xa78bfa), // light violet
  new THREE.Color(0x22d3ee), // turquoise
  new THREE.Color(0xc4b5fd), // pale violet
  new THREE.Color(0x06b6d4), // deep turquoise
  new THREE.Color(0xffffff), // white accent
];
const PALETTE_WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10];

function pickPaletteColor(): THREE.Color {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < PALETTE.length; i++) {
    acc += PALETTE_WEIGHTS[i]!;
    if (r < acc) return PALETTE[i]!;
  }
  return PALETTE[PALETTE.length - 1]!;
}

/** Soft round point texture so each particle reads as a dot, not a square. */
function makeRoundParticleTexture(): THREE.Texture {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0,    'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export type ParallaxStars = {
  points: THREE.Points;
  /** Per frame: update theta from spin, then write positions. */
  update: (dt: number) => void;
  /** External spin multiplier. 1.0 = base swirl, 0 = locked still,
   *  >1 ramps up. Applied immediately (no smoothing here — caller
   *  decides whether to lerp or snap). */
  setSpinMul: (mul: number) => void;
  /** Whole-field alpha 0..1. Caller can lerp for crossfades. */
  setAlpha: (a: number) => void;
  /** Refresh inner/outer radius from viewport. Call on resize. */
  resize: (w: number, h: number) => void;
  dispose: () => void;
};

export function createParallaxStars(): ParallaxStars {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors    = new Float32Array(PARTICLE_COUNT * 3);
  const theta     = new Float32Array(PARTICLE_COUNT);
  const radius    = new Float32Array(PARTICLE_COUNT);
  const radiusFrac = new Float32Array(PARTICLE_COUNT); // 0..1 — resize uses this
  const omega     = new Float32Array(PARTICLE_COUNT);
  const zBob      = new Float32Array(PARTICLE_COUNT);
  const zBobPhase = new Float32Array(PARTICLE_COUNT);

  let bobT = 0;
  let spinMul = 1.0;

  // Seed initial state (positions will be written on first update()).
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    theta[i] = Math.random() * Math.PI * 2;
    radiusFrac[i] = Math.random();
    omega[i] = (Math.random() < 0.5 ? -1 : 1) * BASE_OMEGA * (1 - OMEGA_JITTER + Math.random() * OMEGA_JITTER * 2);
    zBob[i] = 6 + Math.random() * 14;       // small z wobble, mostly cosmetic
    zBobPhase[i] = Math.random() * Math.PI * 2;
    const col = pickPaletteColor();
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
    radius[i] = 0; // resize() fills this
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const tex = makeRoundParticleTexture();
  const mat = new THREE.PointsMaterial({
    size: POINT_SIZE_PX,
    sizeAttenuation: false,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
    map: tex,
  });
  const points = new THREE.Points(geom, mat);
  points.renderOrder = -500; // behind the turtle, in front of the streak plane

  function resize(w: number, h: number): void {
    const minDim = Math.min(w, h);
    const rIn  = minDim * RADIUS_INNER_FRAC;
    const rOut = minDim * RADIUS_OUTER_FRAC;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      radius[i] = rIn + radiusFrac[i]! * (rOut - rIn);
    }
  }

  function update(dt: number): void {
    bobT += dt;
    const posArr = geom.attributes.position!.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      theta[i]! += omega[i]! * spinMul * dt;
      const r = radius[i]!;
      const t = theta[i]!;
      posArr[i * 3 + 0] = Math.cos(t) * r;
      posArr[i * 3 + 1] = Math.sin(t) * r;
      posArr[i * 3 + 2] = Z_DEPTH + Math.sin(bobT * 0.7 + zBobPhase[i]!) * zBob[i]!;
    }
    geom.attributes.position!.needsUpdate = true;
  }

  function setSpinMul(mul: number): void {
    spinMul = mul;
  }
  function setAlpha(a: number): void {
    mat.opacity = Math.max(0, Math.min(1, a));
  }
  function dispose(): void {
    geom.dispose();
    mat.dispose();
    tex.dispose();
    if (points.parent) points.parent.remove(points);
  }

  return { points, update, setSpinMul, setAlpha, resize, dispose };
}
