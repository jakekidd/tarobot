// Behavior confirmation for every leyebrary formula. These mirror the
// GLSL exactly (shared constants via GLSL_CONSTS), so a passing suite
// means the fields the GPU draws have the shape we claim: bounded,
// periodic where they should be, symmetric where they should be.

import { describe, expect, it } from 'vitest';
import {
  EYE_ASPECT,
  FBM,
  GLSL_CONSTS,
  GOLDEN_ANGLE,
  INTERFERENCE,
  KALEIDO,
  PALETTES,
  SPIRAL,
  TAU,
  TUNNEL,
  blinkEnvelope,
  clamp01,
  domainWarp,
  ellipseDist,
  fbm,
  hash2,
  interferenceField,
  kaleidoFold,
  lidMask,
  palette,
  phylloField,
  phylloSeed,
  pupilOffset,
  saccade,
  spiralField,
  tunnelField,
  valueNoise,
  vergenceAngle,
} from '../src/leyebrary/math';

const samples = (n: number, span = 2): number[] =>
  Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));

describe('cosine palettes', () => {
  it('every palette stays inside [0,1] rgb across the full period', () => {
    for (const pal of Object.values(PALETTES)) {
      for (const t of samples(400, 2)) {
        const c = palette(pal, t);
        for (const ch of [c.x, c.y, c.z]) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('spectrum is periodic with period 1 and actually cycles hue', () => {
    const p = PALETTES.spectrum;
    const a = palette(p, 0.2);
    const b = palette(p, 1.2);
    expect(a.x).toBeCloseTo(b.x, 10);
    expect(a.y).toBeCloseTo(b.y, 10);
    // the wheel turns: red peaks at t=0, blue at t=1/3, green at t=2/3
    const t0 = palette(p, 0);
    const t3 = palette(p, 1 / 3);
    const t6 = palette(p, 2 / 3);
    expect(t0.x).toBeGreaterThan(t0.y);
    expect(t3.z).toBeGreaterThan(t3.x);
    expect(t6.y).toBeGreaterThan(t6.z);
  });
});

describe('hash / noise / fbm', () => {
  it('hash2 lands in [0,1) and decorrelates neighboring cells', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        const h = hash2(i, j);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        seen.add(h.toFixed(6));
      }
    }
    expect(seen.size).toBeGreaterThan(390); // 400 cells, near-zero collisions
  });

  it('valueNoise interpolates its own lattice exactly', () => {
    expect(valueNoise(3, 5)).toBeCloseTo(hash2(3, 5), 10);
    expect(valueNoise(3.5, 5)).toBeGreaterThanOrEqual(0);
    expect(valueNoise(3.5, 5)).toBeLessThanOrEqual(1);
  });

  it('valueNoise is continuous across cell boundaries', () => {
    const eps = 1e-5;
    for (const x of [1, 2, 7]) {
      const before = valueNoise(x - eps, 4.3);
      const after = valueNoise(x + eps, 4.3);
      expect(Math.abs(before - after)).toBeLessThan(1e-3);
    }
  });

  it('fbm stays inside the geometric-series bound', () => {
    // Σ gain^k for k<octaves, with each octave in [0,1]
    let bound = 0;
    let amp = 0.5;
    for (let i = 0; i < FBM.octaves; i++) {
      bound += amp;
      amp *= FBM.gain;
    }
    for (const x of samples(30)) {
      for (const y of samples(30)) {
        const v = fbm(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(bound + 1e-9);
      }
    }
  });

  it('domainWarp is bounded like fbm and moves with time', () => {
    let moved = false;
    for (const x of samples(12, 1)) {
      const a = domainWarp(x, 0.3, 0);
      const b = domainWarp(x, 0.3, 5);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      if (Math.abs(a - b) > 1e-3) moved = true;
    }
    expect(moved).toBe(true);
  });
});

describe('the hypno-spiral', () => {
  it('is bounded in [-1,1]', () => {
    for (const x of samples(25, 1)) {
      for (const y of samples(25, 1)) {
        const v = spiralField(x, y, 1.7);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is scale-invariant up to arm rotation: scaling radius = rotating', () => {
    // f(k·p) at angle θ equals f(p) at θ + twist·log(k)/arms — the
    // endless-fall property. Verify via the closed form.
    const r = 0.5;
    const theta = 1.1;
    const k = 1.9;
    const t = 0.4;
    const a = spiralField(r * Math.cos(theta), r * Math.sin(theta), t);
    const rotated = theta - (SPIRAL.twist * Math.log(k)) / SPIRAL.arms;
    const b = spiralField(
      k * r * Math.cos(rotated),
      k * r * Math.sin(rotated),
      t,
    );
    expect(a).toBeCloseTo(b, 6);
  });

  it('rotates over time: time shift = angle shift', () => {
    const x = 0.4;
    const y = 0.2;
    const dt = 0.8;
    const r = Math.hypot(x, y);
    const theta = Math.atan2(y, x) + (SPIRAL.speed * dt) / SPIRAL.arms;
    const a = spiralField(x, y, 0);
    const b = spiralField(r * Math.cos(theta), r * Math.sin(theta), dt);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('interference (the ripple)', () => {
  it('is normalized to [-1,1] and animates', () => {
    let moved = false;
    for (const x of samples(20, 1)) {
      for (const y of samples(20, 1)) {
        const v = interferenceField(x, y, 2.2);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
        if (Math.abs(v - interferenceField(x, y, 2.7)) > 1e-3) moved = true;
      }
    }
    expect(moved).toBe(true);
  });

  it('waves radiate: along a ray, phase advances with distance', () => {
    // freq · Δr should shift the argument measurably
    const a = interferenceField(0.1, 0, 0);
    const b = interferenceField(0.1 + Math.PI / INTERFERENCE.freq, 0, 0);
    expect(Math.abs(a - b)).toBeGreaterThan(0.05);
  });
});

describe('kaleidoscope fold', () => {
  it('preserves radius exactly', () => {
    for (const x of samples(15, 1)) {
      for (const y of samples(15, 1)) {
        const p = kaleidoFold(x, y);
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(x, y), 10);
      }
    }
  });

  it('imposes N-fold symmetry: rotating input by a wedge is identity', () => {
    const wedge = TAU / KALEIDO.segments;
    const x = 0.62;
    const y = 0.17;
    const a = kaleidoFold(x, y);
    const b = kaleidoFold(
      x * Math.cos(wedge) - y * Math.sin(wedge),
      x * Math.sin(wedge) + y * Math.cos(wedge),
    );
    expect(a.x).toBeCloseTo(b.x, 8);
    expect(a.y).toBeCloseTo(b.y, 8);
  });

  it('imposes mirror symmetry inside the wedge', () => {
    const a = kaleidoFold(0.5, 0.1);
    const b = kaleidoFold(0.5, -0.1);
    expect(a.x).toBeCloseTo(b.x, 8);
    expect(a.y).toBeCloseTo(b.y, 8);
  });

  it('folded angle always lands in [0, wedge/2]', () => {
    const wedge = TAU / KALEIDO.segments;
    for (const x of samples(20, 1)) {
      for (const y of samples(20, 1)) {
        if (x === 0 && y === 0) continue;
        const p = kaleidoFold(x, y);
        const theta = Math.atan2(p.y, p.x);
        expect(theta).toBeGreaterThanOrEqual(-1e-9);
        expect(theta).toBeLessThanOrEqual(wedge / 2 + 1e-9);
      }
    }
  });
});

describe('log-polar tunnel', () => {
  it('is bounded in [-1,1]', () => {
    for (const x of samples(20, 1)) {
      for (const y of samples(20, 1)) {
        if (x === 0 && y === 0) continue;
        const v = tunnelField(x, y, 3.1);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('zoom-invariance: scaling radius by one band period repeats exactly', () => {
    const x = 0.3;
    const y = 0.2;
    // log r advances by 2π when r scales by e^(2π/bands)
    const period = Math.exp(TAU / TUNNEL.bands);
    const a = tunnelField(x, y, 0.7);
    const b = tunnelField(x * period, y * period, 0.7);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('phyllotaxis', () => {
  it('seed n sits at golden-angle multiples on the √n spiral', () => {
    const s5 = phylloSeed(5);
    expect(Math.hypot(s5.x, s5.y)).toBeCloseTo(0.055 * Math.sqrt(5), 10);
    const angle = Math.atan2(s5.y, s5.x);
    const expected = ((5 * GOLDEN_ANGLE) % TAU + TAU) % TAU;
    const got = ((angle % TAU) + TAU) % TAU;
    expect(Math.min(Math.abs(got - expected), TAU - Math.abs(got - expected))).toBeLessThan(1e-9);
  });

  it('field peaks at a seed and dies between seeds', () => {
    const seed = phylloSeed(40);
    expect(phylloField(seed.x, seed.y, 0)).toBeGreaterThan(0.9);
    // far outside the lattice reach → 0
    expect(phylloField(5, 5, 0)).toBe(0);
  });

  it('field is bounded in [0,1]', () => {
    for (const x of samples(20, 0.6)) {
      for (const y of samples(20, 0.6)) {
        const v = phylloField(x, y, 1.3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('eye anatomy', () => {
  it('ellipseDist: unit contour matches the (1, aspect) ellipse', () => {
    expect(ellipseDist(1, 0)).toBeCloseTo(1, 10);
    expect(ellipseDist(0, EYE_ASPECT)).toBeCloseTo(1, 10);
    expect(ellipseDist(0, 0)).toBe(0);
  });

  it('lidMask: open eye passes center, shut eye passes nothing', () => {
    expect(lidMask(0, 0, 0)).toBe(1);
    expect(lidMask(0, 0, 1)).toBe(0); // aperture collapsed
    expect(lidMask(0.99, 0.6, 0)).toBe(0); // outside the rim
  });

  it('lidMask shrinks monotonically as the lid closes', () => {
    const probe = { x: 0.3, y: 0.35 };
    let prev = 1;
    for (let lid = 0; lid <= 1; lid += 0.1) {
      const m = lidMask(probe.x, probe.y, lid);
      expect(m).toBeLessThanOrEqual(prev + 1e-9);
      prev = m;
    }
  });

  it('blinkEnvelope: closed at endpoints, fully shut at midpoint, symmetric', () => {
    expect(blinkEnvelope(0)).toBe(0);
    expect(blinkEnvelope(1)).toBe(0);
    expect(blinkEnvelope(0.5)).toBeCloseTo(1, 10);
    expect(blinkEnvelope(0.25)).toBeCloseTo(blinkEnvelope(0.75), 10);
  });
});

describe('the gaze rig', () => {
  it('vergence tightens as the target approaches', () => {
    const far = vergenceAngle(0.6, 10);
    const near = vergenceAngle(0.6, 0.8);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeLessThan(Math.PI / 2);
  });

  it('pupilOffset never escapes the clamp disc', () => {
    for (const dx of samples(10, 3)) {
      for (const dy of samples(10, 3)) {
        const o = pupilOffset(dx, dy, 0.5, 0.35);
        expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(0.35 + 1e-9);
      }
    }
  });

  it('saccade: coupled wander stays inside amplitude, eyes nearly agree', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const l = saccade(t, 0);
      const r = saccade(t, 1);
      expect(Math.hypot(l.x, l.y)).toBeLessThan(0.1);
      // 92% coupling: the disagreement is a fraction of the swing
      expect(Math.hypot(l.x - r.x, l.y - r.y)).toBeLessThan(0.02);
    }
  });
});

describe('glsl constant bridge', () => {
  it('every serialized constant parses back to its TS value', () => {
    expect(Number(GLSL_CONSTS.GOLDEN_ANGLE)).toBeCloseTo(GOLDEN_ANGLE, 12);
    expect(Number(GLSL_CONSTS.EYE_ASPECT)).toBeCloseTo(EYE_ASPECT, 12);
    expect(Number(GLSL_CONSTS.SPIRAL_TWIST)).toBeCloseTo(SPIRAL.twist, 12);
    expect(Number(GLSL_CONSTS.FBM_OCTAVES)).toBe(FBM.octaves);
  });

  it('float-typed constants carry a decimal point for GLSL', () => {
    for (const [k, v] of Object.entries(GLSL_CONSTS)) {
      if (k === 'FBM_OCTAVES' || k === 'INTERF_CENTERS') continue;
      expect(v.includes('.') || v.includes('e'), `${k}=${v}`).toBe(true);
    }
  });
});

describe('clamp01', () => {
  it('clamps', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});
