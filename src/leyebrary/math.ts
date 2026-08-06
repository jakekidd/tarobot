// The leyebrary's formula core — every field the eye shaders draw,
// mirrored in pure TypeScript so vitest can interrogate the math the
// GPU runs. glsl.ts interpolates the SAME constants into the shader
// source; change a number here and both sides move together.
//
// Lineage: the hypno-spiral resurrects the canvas eyes of 3cdef31
// (spiral-when-thinking, may 2026); the interference field resurrects
// the violet→turquoise ripple of 0e815d5. The rest is the classic
// psychedelic toolkit — cosine palettes + domain warping (Quilez),
// per-pixel polar remapping (MilkDrop/AVS), Vogel phyllotaxis.

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export const TAU = Math.PI * 2;

// Vogel's golden angle, radians — π(3 − √5).
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ─── cosine palettes ─────────────────────────────────────────────
// pal(t) = a + b·cos(2π(c·t + d)) — Quilez gradient form. Each row
// vec3 (r,g,b). `spectrum` is the full rainbow; `vesper` stays in the
// brand violet↔turquoise lane so idle eyes don't go clown-mode.

export type Palette = { a: Vec3; b: Vec3; c: Vec3; d: Vec3 };

export const PALETTES: Record<string, Palette> = {
  spectrum: {
    a: { x: 0.5, y: 0.5, z: 0.5 },
    b: { x: 0.5, y: 0.5, z: 0.5 },
    c: { x: 1.0, y: 1.0, z: 1.0 },
    d: { x: 0.0, y: 0.333, z: 0.667 },
  },
  vesper: {
    a: { x: 0.55, y: 0.35, z: 0.75 },
    b: { x: 0.35, y: 0.35, z: 0.25 },
    c: { x: 1.0, y: 1.0, z: 1.0 },
    d: { x: 0.6, y: 0.85, z: 0.55 },
  },
  ember: {
    a: { x: 0.6, y: 0.3, z: 0.35 },
    b: { x: 0.4, y: 0.3, z: 0.3 },
    c: { x: 1.0, y: 1.0, z: 0.7 },
    d: { x: 0.0, y: 0.15, z: 0.35 },
  },
};

export function palette(p: Palette, t: number): Vec3 {
  return {
    x: p.a.x + p.b.x * Math.cos(TAU * (p.c.x * t + p.d.x)),
    y: p.a.y + p.b.y * Math.cos(TAU * (p.c.y * t + p.d.y)),
    z: p.a.z + p.b.z * Math.cos(TAU * (p.c.z * t + p.d.z)),
  };
}

// ─── hash / noise / fbm ──────────────────────────────────────────
// The classic sin-dot hash — same expression the GLSL side uses, so
// the two fields agree in structure (float precision differs; the
// tests assert invariants, not bit-equality).

export const HASH_K = { x: 127.1, y: 311.7, scale: 43758.5453123 };

export function hash2(x: number, y: number): number {
  const s = Math.sin(x * HASH_K.x + y * HASH_K.y) * HASH_K.scale;
  return s - Math.floor(s);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const ux = smooth(fx);
  const uy = smooth(fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export const FBM = { octaves: 4, lacunarity: 2.0, gain: 0.5 };

export function fbm(x: number, y: number): number {
  let amp = 0.5;
  let freq = 1.0;
  let sum = 0;
  for (let i = 0; i < FBM.octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    amp *= FBM.gain;
    freq *= FBM.lacunarity;
  }
  return sum;
}

// Domain warp — fbm fed through itself twice (Quilez, "warp" article).
// WARP_A/WARP_B are the fold strengths; time slides the inner field.
export const WARP = { a: 1.7, b: 1.9, drift: 0.13 };

export function domainWarp(x: number, y: number, t: number): number {
  const qx = fbm(x + WARP.drift * t, y);
  const qy = fbm(x + 5.2, y + 1.3 - WARP.drift * t * 0.7);
  const rx = fbm(x + WARP.a * qx + 1.7, y + WARP.a * qy + 9.2);
  const ry = fbm(x + WARP.b * qx + 8.3, y + WARP.b * qy + 2.8);
  return fbm(x + 4.0 * rx, y + 4.0 * ry);
}

// ─── the hypno-spiral ────────────────────────────────────────────
// sin(arms·θ + twist·log(r) − speed·t). The log(r) term makes the
// stripes scale-invariant — the spiral falls inward forever without
// ever arriving. arms=2..3, twist 4..7 is the OG register.

export const SPIRAL = { arms: 3, twist: 5.5, speed: 1.6 };

export function spiralField(x: number, y: number, t: number): number {
  const r = Math.max(1e-6, Math.hypot(x, y));
  const theta = Math.atan2(y, x);
  return Math.sin(SPIRAL.arms * theta + SPIRAL.twist * Math.log(r) - SPIRAL.speed * t);
}

// ─── interference (the ripple, resurrected) ──────────────────────
// Waves radiating from drifting centers, summed. Two centers orbiting
// slowly out of phase gives the moiré bloom the old canvas rings only
// hinted at. Normalized to [-1, 1] by the center count.

export const INTERFERENCE = { centers: 3, freq: 18.0, speed: 2.2, orbit: 0.35 };

export function interferenceField(x: number, y: number, t: number): number {
  let sum = 0;
  for (let i = 0; i < INTERFERENCE.centers; i++) {
    const a = (i / INTERFERENCE.centers) * TAU + t * (0.11 + 0.05 * i);
    const cx = Math.cos(a) * INTERFERENCE.orbit;
    const cy = Math.sin(a * 1.3) * INTERFERENCE.orbit;
    sum += Math.sin(Math.hypot(x - cx, y - cy) * INTERFERENCE.freq - t * INTERFERENCE.speed);
  }
  return sum / INTERFERENCE.centers;
}

// ─── kaleidoscope fold ───────────────────────────────────────────
// Angle folded into one mirrored wedge of 2π/segments. Any field
// sampled through the fold inherits N-fold dihedral symmetry.

export const KALEIDO = { segments: 6 };

export function kaleidoFold(x: number, y: number, segments = KALEIDO.segments): Vec2 {
  const r = Math.hypot(x, y);
  let theta = Math.atan2(y, x);
  const wedge = TAU / segments;
  theta = ((theta % wedge) + wedge) % wedge;
  theta = Math.abs(theta - wedge / 2);
  return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
}

// ─── log-polar tunnel ────────────────────────────────────────────
// (log r, θ) with log r scrolling — the infinite approach. Banding
// via sin on both axes gives the checker-tunnel every demo ever shipped.

export const TUNNEL = { bands: 5.0, spokes: 8, speed: 1.1 };

export function tunnelField(x: number, y: number, t: number): number {
  const r = Math.max(1e-6, Math.hypot(x, y));
  const theta = Math.atan2(y, x);
  const u = Math.log(r) * TUNNEL.bands - t * TUNNEL.speed;
  const v = theta * TUNNEL.spokes;
  return Math.sin(u) * Math.cos(v);
}

// ─── phyllotaxis ─────────────────────────────────────────────────
// Vogel spiral: seed n sits at θ = n·GOLDEN_ANGLE, r = spacing·√n.
// The field form inverts r → n and checks a neighborhood of candidate
// seeds, so the GPU never loops over the whole lattice.

export const PHYLLO = { spacing: 0.055, dotRadius: 0.42, spin: 0.07 };

export function phylloSeed(n: number, spacing = PHYLLO.spacing): Vec2 {
  const theta = n * GOLDEN_ANGLE;
  const r = spacing * Math.sqrt(n);
  return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
}

export function phylloField(x: number, y: number, t: number): number {
  const rot = t * PHYLLO.spin;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const px = x * c + y * s;
  const py = -x * s + y * c;
  const r = Math.hypot(px, py);
  const guess = Math.round((r / PHYLLO.spacing) ** 2);
  let best = Infinity;
  for (let dn = -3; dn <= 3; dn++) {
    const n = guess + dn;
    if (n < 1) continue;
    const seed = phylloSeed(n);
    const d = Math.hypot(px - seed.x, py - seed.y);
    if (d < best) best = d;
  }
  const cell = PHYLLO.spacing * PHYLLO.dotRadius;
  return Math.max(0, 1 - best / cell);
}

// ─── rose curves (the mandala) ───────────────────────────────────
// Rhodonea r = amp·|cos(k·θ)| — the spirograph/guilloché flower.
// Three layers with distinct petal counts, spins, and palette phases,
// rendered as neon lines (sharp gaussian) over a soft glow skirt.
// Parameters are seeded per session; both eyes share the seed.

export const ROSE = {
  layers: 3,
  amps: [0.52, 0.38, 0.24] as const,
  lineSharp: 900,
  glowFall: 14,
  glowGain: 0.25,
  breathe: 0.06,
  breatheFreq: 0.9,
};

export const ROSE_K_CHOICES = [3, 4, 5, 6, 7, 8, 9, 12] as const;

export type RoseParams = {
  k: [number, number, number];
  spin: [number, number, number];
  phase: [number, number, number];
};

// mulberry32 — tiny deterministic PRNG so a session seed always grows
// the same flower on both eyes.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRose(seed: number): RoseParams {
  const rnd = mulberry32(seed);
  const pool = [...ROSE_K_CHOICES];
  const pick = (): number => pool.splice(Math.floor(rnd() * pool.length), 1)[0];
  const spin = (base: number): number => (rnd() < 0.5 ? -1 : 1) * (base + rnd() * 0.1);
  return {
    k: [pick(), pick(), pick()],
    spin: [spin(0.05), spin(0.09), spin(0.14)],
    phase: [rnd(), rnd(), rnd()],
  };
}

export function roseLayerIntensity(
  r: number,
  theta: number,
  t: number,
  k: number,
  spin: number,
  amp: number,
): number {
  const breathing = amp * (1 + ROSE.breathe * Math.sin(t * ROSE.breatheFreq));
  const target = breathing * Math.abs(Math.cos(k * (theta + spin * t)));
  const d = Math.abs(r - target);
  const line = Math.exp(-d * d * ROSE.lineSharp);
  const glow = Math.exp(-d * ROSE.glowFall) * ROSE.glowGain;
  return line + glow;
}

// Complementary pairing: slide a palette half a cycle along its own
// loop. For the spectrum palette that is exactly the opposite hue;
// for the branded lanes it is the far end of the lane.
export function shiftPalette(p: Palette, shift: number): Palette {
  return {
    a: p.a,
    b: p.b,
    c: p.c,
    d: { x: p.d.x + shift, y: p.d.y + shift, z: p.d.z + shift },
  };
}

// ─── form constants (the hallucination engine) ───────────────────
//
// Klüver (1926) catalogued what people actually see on mescaline and
// found four recurring geometries: lattices/honeycombs, cobwebs,
// tunnels/funnels, and spirals. Ermentrout & Cowan (1979) explained
// why, and the explanation is the reason this look exists.
//
// V1 sees the visual field through a complex logarithm — the
// retino-cortical map. A point at radius r, angle θ in the eye lands
// at (log r, θ) on the flat cortical sheet. When cortical excitation
// destabilizes (which is what a 5-HT2A agonist does to the E/I
// balance), it does what every reaction-diffusion system does: it
// forms stripes. Plain, straight, boring cortical stripes.
//
// Those stripes, seen back through the inverse map, are the form
// constants. A cortical stripe at angle α becomes:
//
//   α = 0        rings              → the TUNNEL
//   α = π/2      radial spokes      → the FUNNEL
//   0 < α < π/2  log spiral, pitch tan α → the SPIRAL
//   three stripes at 120°           → the HONEYCOMB
//
// So one angle sweeps the entire taxonomy. That is the whole trick:
// the eyes aren't showing psychedelic patterns, they are showing what
// a destabilized visual cortex geometrically must produce.

export const FORM = { k: 7.0, omega: 0.55, contrast: 1.0, minRadius: 1e-4 };

/** the retino-cortical map: visual field (r,θ) → cortical (x,y) */
export function retinoCortical(x: number, y: number): Vec2 {
  const r = Math.max(FORM.minRadius, Math.hypot(x, y));
  return { x: Math.log(r), y: Math.atan2(y, x) };
}

/** and back — cortical (x,y) → visual field */
export function corticalRetino(cx: number, cy: number): Vec2 {
  const r = Math.exp(cx);
  return { x: Math.cos(cy) * r, y: Math.sin(cy) * r };
}

/**
 * One cortical plane wave (a "roll" planform) at orientation alpha,
 * read out in visual-field coordinates. alpha is the knob that sweeps
 * tunnel → spiral → funnel.
 */
export function corticalRoll(
  x: number,
  y: number,
  alpha: number,
  t: number,
  k = FORM.k,
  omega = FORM.omega,
): number {
  const c = retinoCortical(x, y);
  return Math.cos(k * (c.x * Math.cos(alpha) + c.y * Math.sin(alpha)) - omega * t);
}

/**
 * The hexagonal planform — three rolls at 120°, which is what a
 * pattern-forming cortex settles into when the quadratic term wins.
 * Inverse-maps to the honeycomb/lattice class.
 */
export function corticalHex(
  x: number,
  y: number,
  alpha: number,
  t: number,
  k = FORM.k,
  omega = FORM.omega,
): number {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    sum += corticalRoll(x, y, alpha + (i * TAU) / 3, t, k, omega);
  }
  return sum / 3;
}

/**
 * The pitch of the logarithmic spiral a cortical stripe of angle
 * alpha produces. Constant phase means cosα·log r + sinα·θ = c, so
 * r = A·exp(−tanα · θ) — a log spiral whose tightness IS tan α.
 * alpha → 0 gives infinite pitch (rings); alpha → π/2 gives zero
 * pitch (spokes).
 */
export function spiralPitch(alpha: number): number {
  const c = Math.cos(alpha);
  if (Math.abs(c) < 1e-12) return Infinity;
  return Math.tan(alpha);
}

/** the four Klüver classes, as positions on the alpha sweep */
export const FORM_CONSTANTS = {
  tunnel: 0,
  spiral: Math.PI / 4,
  funnel: Math.PI / 2,
} as const;

// ─── peripheral drift (illusory motion) ──────────────────────────
// Kitaoka's rotating-snakes staircase: a repeating asymmetric
// luminance ramp (black → dark → white → light → black). The visual
// system's differential latency across contrast makes a STATIC ramp
// read as motion, in the direction of the asymmetry. Built here as a
// luminance multiplier so it can ride on top of any field.

export const DRIFT = { steps: 4, gain: 0.55, sharpness: 0.35 };

/** luminance staircase at phase u ∈ [0,1) within one cycle */
export function driftStaircase(u: number): number {
  const p = ((u % 1) + 1) % 1;
  const stops = [0.0, 0.32, 1.0, 0.68];
  const idx = Math.floor(p * DRIFT.steps) % DRIFT.steps;
  const frac = p * DRIFT.steps - Math.floor(p * DRIFT.steps);
  const a = stops[idx];
  const b = stops[(idx + 1) % DRIFT.steps];
  // sharp-ish transitions: the illusion needs edges, not a sine
  const e = smoothstepScalar(DRIFT.sharpness, 1 - DRIFT.sharpness, frac);
  return a + (b - a) * e;
}

function smoothstepScalar(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// ─── feedback remap (the MilkDrop/AVS loop) ──────────────────────
// The engine of every classic visualizer: each frame samples the
// PREVIOUS frame through a polar remap, decayed, with new ink stamped
// on top. The remap below is AVS "Swirl To Center" with its published
// coefficients; the discipline (radial gain ∈ [0.94, 1.06], angular
// step ≤ 0.1) is what keeps feedback tasteful instead of tearing.

export const FEEDBACK = {
  decay: 0.965,
  hueStep: 0.008,
  ditherAmp: 0.006,
  swirlGain: 0.04,
  swirlBase: 1.01,
  swirlLobes: 4,
  twistAmp: 0.03,
};

export function feedbackRemap(x: number, y: number): Vec2 {
  const d = Math.hypot(x, y);
  const r = Math.atan2(y, x);
  const d2 = d * (FEEDBACK.swirlBase + Math.cos((r - Math.PI / 2) * FEEDBACK.swirlLobes) * FEEDBACK.swirlGain);
  const r2 = r + FEEDBACK.twistAmp * Math.sin(d * Math.PI * 4);
  return { x: Math.cos(r2) * d2, y: Math.sin(r2) * d2 };
}

// ─── the grade (Inscryption posterize) ───────────────────────────
// Luma-thresholded posterize: darks snap to a coarse color grid,
// highlights pass through untouched — hard shadows, readable light.

export const GRADE = { levels: 5, lumaCutoff: 0.62, lumaSoft: 0.1 };

export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function posterize(r: number, g: number, b: number): Vec3 {
  const l = luma(r, g, b);
  const q = (v: number): number => Math.round(v * GRADE.levels) / GRADE.levels;
  const t = clamp01((l - (GRADE.lumaCutoff - GRADE.lumaSoft)) / (2 * GRADE.lumaSoft));
  const m = t * t * (3 - 2 * t);
  return {
    x: q(r) + (r - q(r)) * m,
    y: q(g) + (g - q(g)) * m,
    z: q(b) + (b - q(b)) * m,
  };
}

// ─── eye anatomy masks ───────────────────────────────────────────
// Everything is drawn in "eye space": p in [-1,1]², the eye an
// ellipse with radii (1, EYE_ASPECT). ellipseDist < 1 inside.

export const EYE_ASPECT = 0.72;

export function ellipseDist(x: number, y: number, aspect = EYE_ASPECT): number {
  return Math.hypot(x, y / aspect);
}

// Lid closure: the lids are a horizontal slit clamping |y| to the
// open aperture. lid=0 rests the slit at the eye rim; lid=1 seals it
// — including the center, which a pure y-squash never covers.
export function lidMask(x: number, y: number, lid: number, edge = 0.08): number {
  const rim = clamp01((1 + edge - ellipseDist(x, y)) / edge);
  const aperture = (1 - lid) * EYE_ASPECT;
  return rim * clamp01((aperture - Math.abs(y)) / edge);
}

// Blink envelope — raised-cosine dip, 0 open → 1 shut → 0 open.
export function blinkEnvelope(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return 0.5 - 0.5 * Math.cos(TAU * u);
}

// ─── the gaze rig ────────────────────────────────────────────────
// Two eyes separated by `sep` converging on a target `dist` away:
// each eye toes in by atan(sep/2 / dist). Near targets cross the
// eyes — that convergence is what reads as *attached* attention.

export function vergenceAngle(sep: number, dist: number): number {
  return Math.atan2(sep / 2, Math.max(1e-4, dist));
}

// Pupil offset inside the flat eye for a gaze direction (dx, dy, dz):
// project onto the eye plane, clamp to keep the pupil inside the iris.
export function pupilOffset(dx: number, dy: number, dz: number, max = 0.35): Vec2 {
  const d = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const ox = (dx / d) * max;
  const oy = (dy / d) * max;
  const m = Math.hypot(ox, oy);
  if (m <= max) return { x: ox, y: oy };
  return { x: (ox / m) * max, y: (oy / m) * max };
}

// ─── gaze split (body vs pupil) ──────────────────────────────────
// Real eyes aim by rotating the ball; a pupil that slides across a
// stationary sclera reads as a painted-on decal. So gaze is SPLIT: a
// fraction turns the whole eye body, the remainder slides the pupil.
// bodyShare 0 = pupils only (the decal look, kept as a mode), 1 =
// body only (doll eyes), ~0.55 = the living compromise.

export const MOTION = { bodyShare: 0.55, bodySwing: 0.5, bodyShift: 0.06 };

export type GazeSplit = { bodyYaw: number; bodyPitch: number; pupil: Vec2 };

// gx/gy are the gaze direction's components in the eye's own plane,
// gz its component along the eye's forward axis.
export function splitGaze(
  gx: number,
  gy: number,
  gz: number,
  bodyShare = MOTION.bodyShare,
  pupilMax = 0.3,
): GazeSplit {
  const share = clamp01(bodyShare);
  const z = Math.max(1e-4, Math.abs(gz));
  // the angles a real ball would rotate through to point at the target
  const yaw = Math.atan2(gx, z);
  const pitch = Math.atan2(gy, z);
  const off = pupilOffset(gx, gy, gz, pupilMax);
  return {
    bodyYaw: yaw * share * MOTION.bodySwing,
    bodyPitch: pitch * share * MOTION.bodySwing,
    pupil: { x: off.x * (1 - share), y: off.y * (1 - share) },
  };
}

// ─── the cords (optic stalks) ────────────────────────────────────
// Each eye trails a fleshy cord back into the dark. Two motions ride
// it: a peristaltic bulge travelling AWAY from the eye (something is
// being pumped up the stalk toward it), and a slow lateral sway that
// grows with distance from the socket so the far end drifts while the
// attachment stays put.

export const CORD = {
  length: 2.6,
  radius: 0.055,
  taper: 0.55,
  peristalsisFreq: 3.2,
  peristalsisSpeed: 0.55,
  peristalsisAmp: 0.32,
  swayFreq: 0.37,
  swayAmp: 0.22,
};

// Radial swell at normalized distance u ∈ [0,1] along the cord.
// Travels toward the eye (u decreasing) as time advances.
export function peristalsis(u: number, t: number, phase = 0): number {
  return Math.sin((u * CORD.peristalsisFreq + t * CORD.peristalsisSpeed + phase) * TAU);
}

// Cord radius at u: tapers away from the socket, then swells.
export function cordRadius(u: number, t: number, phase = 0): number {
  const taper = 1 - CORD.taper * u;
  return CORD.radius * taper * (1 + CORD.peristalsisAmp * peristalsis(u, t, phase));
}

// Lateral offset of the cord's centerline at u — zero at the socket
// (u=0) so the cord never detaches from the eye it feeds.
export function cordSway(u: number, t: number, phase = 0): Vec2 {
  const grip = u * u;
  return {
    x: Math.sin(t * CORD.swayFreq + phase) * CORD.swayAmp * grip,
    y: Math.cos(t * CORD.swayFreq * 0.73 + phase * 1.7) * CORD.swayAmp * 0.6 * grip,
  };
}

// Micro-saccade: both eyes share one low-frequency noise walk with a
// per-eye phase nudge — coupled wander, never independent drift.
export const SACCADE = { freq: 0.31, amp: 0.045, couple: 0.92 };

export function saccade(t: number, eyeIndex: number): Vec2 {
  const base: Vec2 = {
    x: valueNoise(t * SACCADE.freq, 3.7) - 0.5,
    y: valueNoise(9.1, t * SACCADE.freq) - 0.5,
  };
  const solo: Vec2 = {
    x: valueNoise(t * SACCADE.freq * 1.7, 13.1 + eyeIndex * 7.7) - 0.5,
    y: valueNoise(21.3 + eyeIndex * 5.1, t * SACCADE.freq * 1.7) - 0.5,
  };
  const c = SACCADE.couple;
  return {
    x: (base.x * c + solo.x * (1 - c)) * 2 * SACCADE.amp,
    y: (base.y * c + solo.y * (1 - c)) * 2 * SACCADE.amp,
  };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// GLSL-visible constants, serialized once so glsl.ts and the tests
// read the identical numbers.
export function glslConst(name: keyof typeof GLSL_CONSTS): string {
  return GLSL_CONSTS[name];
}

const f = (n: number): string => {
  const s = String(n);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

export const GLSL_CONSTS = {
  GOLDEN_ANGLE: f(GOLDEN_ANGLE),
  EYE_ASPECT: f(EYE_ASPECT),
  HASH_KX: f(HASH_K.x),
  HASH_KY: f(HASH_K.y),
  HASH_SCALE: f(HASH_K.scale),
  FBM_OCTAVES: String(FBM.octaves),
  FBM_LACUNARITY: f(FBM.lacunarity),
  FBM_GAIN: f(FBM.gain),
  WARP_A: f(WARP.a),
  WARP_B: f(WARP.b),
  WARP_DRIFT: f(WARP.drift),
  SPIRAL_ARMS: f(SPIRAL.arms),
  SPIRAL_TWIST: f(SPIRAL.twist),
  SPIRAL_SPEED: f(SPIRAL.speed),
  INTERF_CENTERS: String(INTERFERENCE.centers),
  INTERF_FREQ: f(INTERFERENCE.freq),
  INTERF_SPEED: f(INTERFERENCE.speed),
  INTERF_ORBIT: f(INTERFERENCE.orbit),
  KALEIDO_SEGMENTS: f(KALEIDO.segments),
  TUNNEL_BANDS: f(TUNNEL.bands),
  TUNNEL_SPOKES: f(TUNNEL.spokes),
  TUNNEL_SPEED: f(TUNNEL.speed),
  PHYLLO_SPACING: f(PHYLLO.spacing),
  PHYLLO_DOT: f(PHYLLO.dotRadius),
  PHYLLO_SPIN: f(PHYLLO.spin),
  ROSE_AMP0: f(ROSE.amps[0]),
  ROSE_AMP1: f(ROSE.amps[1]),
  ROSE_AMP2: f(ROSE.amps[2]),
  ROSE_LINE_SHARP: f(ROSE.lineSharp),
  ROSE_GLOW_FALL: f(ROSE.glowFall),
  ROSE_GLOW_GAIN: f(ROSE.glowGain),
  ROSE_BREATHE: f(ROSE.breathe),
  ROSE_BREATHE_FREQ: f(ROSE.breatheFreq),
  FB_DECAY: f(FEEDBACK.decay),
  FB_HUE_STEP: f(FEEDBACK.hueStep),
  FB_DITHER: f(FEEDBACK.ditherAmp),
  FB_SWIRL_GAIN: f(FEEDBACK.swirlGain),
  FB_SWIRL_BASE: f(FEEDBACK.swirlBase),
  FB_SWIRL_LOBES: f(FEEDBACK.swirlLobes),
  FB_TWIST_AMP: f(FEEDBACK.twistAmp),
  GRADE_LEVELS: f(GRADE.levels),
  GRADE_CUTOFF: f(GRADE.lumaCutoff),
  GRADE_SOFT: f(GRADE.lumaSoft),
  CORD_PERI_FREQ: f(CORD.peristalsisFreq),
  CORD_PERI_SPEED: f(CORD.peristalsisSpeed),
  CORD_PERI_AMP: f(CORD.peristalsisAmp),
  FORM_K: f(FORM.k),
  FORM_OMEGA: f(FORM.omega),
  DRIFT_STEPS: f(DRIFT.steps),
  DRIFT_GAIN: f(DRIFT.gain),
  DRIFT_SHARP: f(DRIFT.sharpness),
} as const;
