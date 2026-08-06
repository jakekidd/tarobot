// The hallucination engine. These assertions are the reason to
// believe the 'vision' look is showing Klüver's form constants and
// not merely something spirally: the SAME roll function, at three
// values of one angle, must produce rings, spirals, and spokes with
// the geometric signatures each of those actually has.

import { describe, expect, it } from 'vitest';
import {
  BREATH,
  FORM,
  FOVEA,
  PINNA,
  FORM_CONSTANTS,
  TAU,
  breathe,
  breatheVec,
  corticalHex,
  corticalRetino,
  corticalRoll,
  driftStaircase,
  formPeriod,
  pinnaField,
  pinnaLoom,
  pinnaRingTilt,
  retinoCortical,
  spiralPitch,
} from '../src/leyebrary/math';

const polar = (r: number, th: number): [number, number] => [
  Math.cos(th) * r,
  Math.sin(th) * r,
];

describe('the retino-cortical map', () => {
  it('is a log with a foveal shoulder — finite at the centre, not singular', () => {
    const c0 = retinoCortical(0, 0);
    expect(c0.x).toBe(0);
    expect(Number.isFinite(c0.x)).toBe(true);
    const c = retinoCortical(...polar(FOVEA.r0 * (Math.E - 1), 0.7));
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

  it('turns scaling into translation once past the fovea', () => {
    // exact statement: the SHIFTED radius scales, which is the same
    // thing far from the centre and better-behaved near it
    const a = retinoCortical(...polar(0.4, 1.2));
    const shifted = FOVEA.r0 * ((1 + 0.4 / FOVEA.r0) * Math.E - 1);
    const b = retinoCortical(...polar(shifted, 1.2));
    expect(b.x - a.x).toBeCloseTo(1, 10);
    expect(b.y).toBeCloseTo(a.y, 10);
  });

  it('pattern period grows LINEARLY with eccentricity (the measured law)', () => {
    // Lambda(r) proportional to (r + r0) — features about 13-15% of
    // eccentricity, matching migraine spectra and phosphene sizes
    const ratio = (r: number): number => formPeriod(r) / (r + FOVEA.r0);
    const ref = ratio(0);
    for (const r of [0.1, 0.4, 1.0, 3.0]) expect(ratio(r)).toBeCloseTo(ref, 12);
    expect(formPeriod(1)).toBeGreaterThan(formPeriod(0));
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
    const rStart = 0.5;
    const ref = corticalRoll(...polar(rStart, th0), alpha, 0);
    for (const dth of [0.4, 1.1, -0.9]) {
      const th = th0 + dth;
      // the spiral lives in the SHIFTED radius: (r + r0) = A*exp(-pitch*theta)
      const r = FOVEA.r0 * ((1 + rStart / FOVEA.r0) * Math.exp(-pitch * dth) - 1);
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
    const grown = FOVEA.r0 * ((1 + r / FOVEA.r0) * scale - 1);
    const b = corticalRoll(...polar(grown, th), 0, dt);
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

describe('breathing', () => {
  it('amp 0 is the identity — breathing is opt-in', () => {
    for (const [x, y] of [polar(0.3, 1.1), polar(0.8, -2.0)]) {
      const v = breatheVec(x, y, 3.3, 0);
      expect(v.x).toBeCloseTo(x, 12);
      expect(v.y).toBeCloseTo(y, 12);
    }
  });

  it('displaces by at most the amplitude — a sigh, not a slosh', () => {
    for (let r = 0.05; r < 1.2; r += 0.05) {
      for (let th = 0; th < TAU; th += 0.4) {
        for (let t = 0; t < 12; t += 0.7) {
          const [x, y] = polar(r, th);
          const rw = breathe(x, y, t);
          expect(Math.abs(rw - r)).toBeLessThanOrEqual(r * BREATH.amp + 1e-12);
        }
      }
    }
  });

  it('is purely radial — the angle never changes, so nothing shears', () => {
    for (let th = -3; th < 3; th += 0.37) {
      const [x, y] = polar(0.55, th);
      const v = breatheVec(x, y, 4.1);
      expect(Math.atan2(v.y, v.x)).toBeCloseTo(th, 8);
    }
  });

  it('is periodic in time at the breath frequency', () => {
    const [x, y] = polar(0.4, 0.8);
    const period = 1 / BREATH.freq;
    expect(breathe(x, y, 1.5)).toBeCloseTo(breathe(x, y, 1.5 + period), 8);
  });

  it('leaves the exact center alone (no singularity at r=0)', () => {
    const v = breatheVec(0, 0, 2.2);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(Number.isFinite(breathe(0, 0, 2.2))).toBe(true);
  });

  it('actually moves — a still "breath" is a bug, not a feature', () => {
    const [x, y] = polar(0.6, 0.3);
    const a = breathe(x, y, 0);
    const b = breathe(x, y, 1 / BREATH.freq / 2);
    expect(Math.abs(a - b)).toBeGreaterThan(1e-3);
  });
});

describe('Pinna–Brelstaff counter-rotation', () => {
  it('the loom only breathes — it never rotates anything', () => {
    for (let t = 0; t < 20; t += 0.13) {
      const s = pinnaLoom(t);
      expect(s).toBeGreaterThanOrEqual(1 - PINNA.loomAmp - 1e-12);
      expect(s).toBeLessThanOrEqual(1 + PINNA.loomAmp + 1e-12);
    }
    const period = TAU / PINNA.loomOmega;
    expect(pinnaLoom(1.1)).toBeCloseTo(pinnaLoom(1.1 + period), 8);
  });

  it('neighbouring rings take opposite tilt — 90° apart, the measured optimum', () => {
    for (let k = 0; k < 5; k++) {
      expect(Math.abs(pinnaRingTilt(k))).toBeCloseTo(PINNA.tilt, 12);
      expect(pinnaRingTilt(k)).toBeCloseTo(-pinnaRingTilt(k + 1), 12);
    }
    // inter-ring orientation difference, which Gurnsey & Pagé peak at ~70–95°
    const delta = Math.abs(pinnaRingTilt(0) - pinnaRingTilt(1));
    expect((delta * 180) / Math.PI).toBeCloseTo(90, 6);
  });

  it('the field is SIGNED — clamping it is one of two documented ways to kill the illusion', () => {
    let sawPositive = false;
    let sawNegative = false;
    for (let x = -0.6; x <= 0.6; x += 0.011) {
      for (let y = -0.6; y <= 0.6; y += 0.011) {
        const v = pinnaField(x, y, 0.4);
        if (v > 0.05) sawPositive = true;
        if (v < -0.05) sawNegative = true;
      }
    }
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
  });

  it('stays inside the contrast bound and dies outside the ring band', () => {
    for (let x = -1; x <= 1; x += 0.017) {
      for (let y = -1; y <= 1; y += 0.017) {
        expect(Math.abs(pinnaField(x, y, 1.7))).toBeLessThanOrEqual(PINNA.contrast + 1e-9);
      }
    }
    expect(pinnaField(0, 0, 0)).toBe(0);
    expect(pinnaField(2.5, 0, 0)).toBe(0);
  });

  it('elements are oriented to the RADIUS, not the screen', () => {
    // rotating the sample point by one whole element cell must land on
    // the identical element — that invariance is what "relative to the
    // centre" means, and it is the whole basis of the illusion
    const rk = PINNA.innerRadius * PINNA.ringRatio;
    const n = Math.max(6, Math.round((TAU * rk) / PINNA.arcPitch));
    const cell = TAU / n;
    const probeR = rk + 0.012;
    for (const th of [0.05, 0.9, -1.4]) {
      const a = pinnaField(...polar(probeR, th), 0);
      const b = pinnaField(...polar(probeR, th + cell), 0);
      expect(a).toBeCloseTo(b, 6);
    }
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
    expect(driftStaircase(0.25)).toBeCloseTo(30 / 70, 6);
    expect(driftStaircase(0.5)).toBeCloseTo(1, 6);
    expect(driftStaircase(0.75)).toBeCloseTo(40 / 70, 6);
  });
});
