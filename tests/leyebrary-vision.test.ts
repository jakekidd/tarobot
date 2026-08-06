// The hallucination engine. These assertions are the reason to
// believe the 'vision' look is showing Klüver's form constants and
// not merely something spirally: the SAME roll function, at three
// values of one angle, must produce rings, spirals, and spokes with
// the geometric signatures each of those actually has.

import { describe, expect, it } from 'vitest';
import {
  FORM,
  FORM_CONSTANTS,
  TAU,
  corticalHex,
  corticalRetino,
  corticalRoll,
  driftStaircase,
  retinoCortical,
  spiralPitch,
} from '../src/leyebrary/math';

const polar = (r: number, th: number): [number, number] => [
  Math.cos(th) * r,
  Math.sin(th) * r,
];

describe('the retino-cortical map', () => {
  it('is a complex logarithm: radius → cortical x, angle → cortical y', () => {
    const c = retinoCortical(...polar(Math.E, 0.7));
    expect(c.x).toBeCloseTo(1, 10);
    expect(c.y).toBeCloseTo(0.7, 10);
  });

  it('round-trips', () => {
    for (const r of [0.05, 0.3, 1, 2.5]) {
      for (const th of [-2.1, -0.4, 0.9, 2.8]) {
        const c = retinoCortical(...polar(r, th));
        const back = corticalRetino(c.x, c.y);
        const [x, y] = polar(r, th);
        expect(back.x).toBeCloseTo(x, 8);
        expect(back.y).toBeCloseTo(y, 8);
      }
    }
  });

  it('turns scaling into translation — why the tunnel never arrives', () => {
    const a = retinoCortical(...polar(0.4, 1.2));
    const b = retinoCortical(...polar(0.4 * Math.E, 1.2));
    expect(b.x - a.x).toBeCloseTo(1, 10);
    expect(b.y).toBeCloseTo(a.y, 10);
  });
});

describe('form constants: one angle sweeps the taxonomy', () => {
  it('alpha=0 gives the TUNNEL — constant on every circle', () => {
    const alpha = FORM_CONSTANTS.tunnel;
    const r = 0.42;
    const ref = corticalRoll(...polar(r, 0), alpha, 0);
    for (const th of [0.5, 1.7, -2.2, 3.0]) {
      expect(corticalRoll(...polar(r, th), alpha, 0)).toBeCloseTo(ref, 9);
    }
    // and it DOES vary with radius, or it would be a flat field
    expect(corticalRoll(...polar(0.9, 0), alpha, 0)).not.toBeCloseTo(ref, 3);
  });

  it('alpha=pi/2 gives the FUNNEL — constant along every ray', () => {
    const alpha = FORM_CONSTANTS.funnel;
    const th = 0.8;
    const ref = corticalRoll(...polar(0.2, th), alpha, 0);
    for (const r of [0.35, 0.6, 0.95]) {
      expect(corticalRoll(...polar(r, th), alpha, 0)).toBeCloseTo(ref, 9);
    }
    expect(corticalRoll(...polar(0.2, th + 0.5), alpha, 0)).not.toBeCloseTo(ref, 3);
  });

  it('the FUNNEL has exactly k spokes around the circle', () => {
    const alpha = FORM_CONSTANTS.funnel;
    let crossings = 0;
    let prev = corticalRoll(...polar(0.5, 0), alpha, 0);
    const steps = 4000;
    for (let i = 1; i <= steps; i++) {
      const th = (i / steps) * TAU;
      const v = corticalRoll(...polar(0.5, th), alpha, 0);
      if (prev < 0 && v >= 0) crossings++;
      prev = v;
    }
    expect(crossings).toBe(Math.round(FORM.k));
  });

  it('intermediate alpha gives a SPIRAL of pitch tan(alpha)', () => {
    const alpha = FORM_CONSTANTS.spiral;
    const pitch = spiralPitch(alpha);
    expect(pitch).toBeCloseTo(1, 10); // tan(45°)
    // walking along r = A·exp(-pitch·θ) must hold the phase constant
    const th0 = 0.3;
    const r0 = 0.5;
    const ref = corticalRoll(...polar(r0, th0), alpha, 0);
    for (const dth of [0.4, 1.1, -0.9]) {
      const th = th0 + dth;
      const r = r0 * Math.exp(-pitch * dth);
      expect(corticalRoll(...polar(r, th), alpha, 0)).toBeCloseTo(ref, 8);
    }
  });

  it('spiral pitch runs from flat (rings) to zero (spokes)', () => {
    expect(spiralPitch(0)).toBe(0);
    expect(spiralPitch(Math.PI / 4)).toBeCloseTo(1, 10);
    expect(spiralPitch(Math.PI / 2)).toBe(Infinity);
    // tighter cortical angle → tighter visual spiral
    expect(spiralPitch(0.9)).toBeGreaterThan(spiralPitch(0.4));
  });

  it('every planform stays bounded in [-1,1]', () => {
    for (const alpha of [0, 0.6, 1.2, Math.PI / 2, 2.4]) {
      for (let r = 0.02; r < 1.2; r += 0.07) {
        for (let th = 0; th < TAU; th += 0.31) {
          const roll = corticalRoll(...polar(r, th), alpha, 1.4);
          const hex = corticalHex(...polar(r, th), alpha, 1.4);
          expect(roll).toBeGreaterThanOrEqual(-1);
          expect(roll).toBeLessThanOrEqual(1);
          expect(hex).toBeGreaterThanOrEqual(-1);
          expect(hex).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('the field drifts with time (the tunnel travels)', () => {
    const p = polar(0.4, 0.9);
    expect(corticalRoll(...p, 0, 0)).not.toBeCloseTo(corticalRoll(...p, 0, 2.5), 3);
  });

  it('time translation equals radial scaling — the endless approach', () => {
    // for the tunnel, advancing time by dt is the same as zooming the
    // visual field: this is why it reads as falling in forever
    const dt = 1.3;
    const scale = Math.exp((FORM.omega * dt) / FORM.k);
    const r = 0.5;
    const th = 1.1;
    const a = corticalRoll(...polar(r, th), 0, 0);
    const b = corticalRoll(...polar(r * scale, th), 0, dt);
    expect(a).toBeCloseTo(b, 8);
  });
});

describe('the hexagonal planform (the honeycomb class)', () => {
  it('has 3-fold symmetry in the cortical plane', () => {
    // three rolls at 120° means rotating alpha by 120° is identity
    const p = polar(0.45, 0.6);
    const a = corticalHex(...p, 0.2, 0);
    const b = corticalHex(...p, 0.2 + TAU / 3, 0);
    expect(a).toBeCloseTo(b, 8);
  });

  it('is not the same field as a single roll', () => {
    const p = polar(0.45, 0.6);
    expect(corticalHex(...p, 0.2, 0)).not.toBeCloseTo(corticalRoll(...p, 0.2, 0), 2);
  });
});

describe('peripheral-drift staircase', () => {
  it('is periodic and bounded', () => {
    for (let u = -2; u < 3; u += 0.013) {
      const v = driftStaircase(u);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeCloseTo(driftStaircase(u + 1), 10);
    }
  });

  it('is ASYMMETRIC — that asymmetry is the whole illusion', () => {
    // a symmetric ramp produces no drift; reversing the cycle must
    // therefore give a different luminance profile
    let diff = 0;
    for (let u = 0; u < 1; u += 0.01) {
      diff += Math.abs(driftStaircase(u) - driftStaircase(-u));
    }
    expect(diff).toBeGreaterThan(5);
  });

  it('walks black → dark → white → light within one cycle', () => {
    expect(driftStaircase(0)).toBeCloseTo(0, 6);
    expect(driftStaircase(0.25)).toBeCloseTo(0.32, 6);
    expect(driftStaircase(0.5)).toBeCloseTo(1, 6);
    expect(driftStaircase(0.75)).toBeCloseTo(0.68, 6);
  });
});
