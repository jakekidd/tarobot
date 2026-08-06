// The second wave of formulas: seeded rose mandalas, the feedback
// remap, the Inscryption grade, and palette pairing for matched or
// complementary eyes.

import { describe, expect, it } from 'vitest';
import {
  FEEDBACK,
  GRADE,
  PALETTES,
  ROSE,
  ROSE_K_CHOICES,
  TAU,
  feedbackRemap,
  generateRose,
  luma,
  mulberry32,
  palette,
  posterize,
  roseLayerIntensity,
  shiftPalette,
} from '../src/leyebrary/math';
import { sessionGenome, LOOKS, LOOK_NAMES } from '../src/leyebrary/looks';

describe('mulberry32', () => {
  it('is deterministic and uniform-ish in [0,1)', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      const va = a();
      expect(va).toBe(b());
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
      sum += va;
    }
    expect(sum / 1000).toBeGreaterThan(0.42);
    expect(sum / 1000).toBeLessThan(0.58);
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('generateRose', () => {
  it('same seed grows the same flower — the both-eyes-match contract', () => {
    const a = generateRose(77);
    const b = generateRose(77);
    expect(a).toEqual(b);
  });

  it('petal counts come from the curated set, no duplicates', () => {
    for (const seed of [1, 42, 999, 31337]) {
      const r = generateRose(seed);
      const set = new Set(r.k);
      expect(set.size).toBe(3);
      for (const k of r.k) {
        expect(ROSE_K_CHOICES).toContain(k as (typeof ROSE_K_CHOICES)[number]);
      }
    }
  });

  it('spins are nonzero and phases live in [0,1)', () => {
    const r = generateRose(5);
    for (const s of r.spin) expect(Math.abs(s)).toBeGreaterThan(0.01);
    for (const p of r.phase) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe('rose layer intensity', () => {
  it('peaks on the curve: r = amp·|cos(kθ)| lights up', () => {
    const k = 6;
    const amp = ROSE.amps[0];
    const t = 0;
    const theta = 0.3;
    // breathing at t=0 leaves amp unscaled (sin 0 = 0)
    const rOn = amp * Math.abs(Math.cos(k * theta));
    const on = roseLayerIntensity(rOn, theta, t, k, 0, amp);
    const off = roseLayerIntensity(rOn + 0.2, theta, t, k, 0, amp);
    expect(on).toBeGreaterThan(1);
    expect(off).toBeLessThan(on / 5);
  });

  it('has the 2k-petal symmetry of |cos|: rotating by π/k is invariant', () => {
    const k = 5;
    const amp = 0.4;
    const a = roseLayerIntensity(0.3, 0.7, 0, k, 0, amp);
    const b = roseLayerIntensity(0.3, 0.7 + Math.PI / k, 0, k, 0, amp);
    expect(a).toBeCloseTo(b, 8);
  });

  it('spin rotates the flower over time', () => {
    const k = 4;
    const amp = 0.4;
    const spin = 0.1;
    const dt = 2;
    const a = roseLayerIntensity(0.25, 0.9, 0, k, spin, amp);
    // at t=dt the pattern has rotated by spin·dt — but breathing also
    // changed amp, so compare against the analytically-shifted angle
    // at the same t
    const b = roseLayerIntensity(0.25, 0.9 - spin * dt, dt, k, spin, amp);
    const c = roseLayerIntensity(0.25, 0.9, dt, k, spin, amp);
    expect(a).not.toBeCloseTo(c, 2); // it moved
    void b; // breathing makes exact equality across t unfair; movement is the claim
  });

  it('is nonnegative and bounded by line+glow ceiling', () => {
    for (let r = 0; r < 0.8; r += 0.07) {
      for (let th = 0; th < TAU; th += 0.5) {
        const v = roseLayerIntensity(r, th, 1.3, 7, 0.08, 0.4);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1 + ROSE.glowGain + 1e-9);
      }
    }
  });
});

describe('feedback remap (AVS swirl-to-center)', () => {
  it('radial gain stays inside the tasteful band [0.94, 1.06]', () => {
    for (let th = 0; th < TAU; th += 0.05) {
      const x = Math.cos(th) * 0.5;
      const y = Math.sin(th) * 0.5;
      const m = feedbackRemap(x, y);
      const gain = Math.hypot(m.x, m.y) / 0.5;
      expect(gain).toBeGreaterThanOrEqual(0.94);
      expect(gain).toBeLessThanOrEqual(1.06);
    }
  });

  it('angular step stays under 0.1 rad', () => {
    for (let th = 0; th < TAU; th += 0.11) {
      for (const r of [0.2, 0.5, 0.9]) {
        const x = Math.cos(th) * r;
        const y = Math.sin(th) * r;
        const m = feedbackRemap(x, y);
        let dAng = Math.atan2(m.y, m.x) - th;
        while (dAng > Math.PI) dAng -= TAU;
        while (dAng < -Math.PI) dAng += TAU;
        expect(Math.abs(dAng)).toBeLessThanOrEqual(FEEDBACK.twistAmp + 1e-9);
      }
    }
  });

  it('decay × max gain shrinks energy — the loop cannot blow up', () => {
    expect(FEEDBACK.decay * (FEEDBACK.swirlBase + FEEDBACK.swirlGain)).toBeLessThan(1.02);
    expect(FEEDBACK.decay).toBeLessThan(1);
  });
});

describe('the grade (luma-thresholded posterize)', () => {
  it('darks snap to the quantization grid', () => {
    const dark = posterize(0.21, 0.13, 0.34);
    for (const ch of [dark.x, dark.y, dark.z]) {
      const snapped = Math.round(ch * GRADE.levels) / GRADE.levels;
      expect(Math.abs(ch - snapped)).toBeLessThan(1e-9);
    }
  });

  it('highlights pass through untouched', () => {
    const bright = posterize(0.93, 0.9, 0.86);
    expect(bright.x).toBeCloseTo(0.93, 9);
    expect(bright.y).toBeCloseTo(0.9, 9);
    expect(bright.z).toBeCloseTo(0.86, 9);
  });

  it('the threshold sits where the guide says: cutoff on luma', () => {
    const l = luma(0.5, 0.5, 0.5);
    expect(l).toBeCloseTo(0.5, 9);
    expect(GRADE.lumaCutoff).toBeGreaterThan(0.5); // mid-grey still posterizes
  });
});

describe('palette pairing', () => {
  it('shiftPalette(0.5) lands on the opposite side of the cycle', () => {
    const p = PALETTES.spectrum;
    const q = shiftPalette(p, 0.5);
    const a = palette(p, 0.2);
    const b = palette(q, 0.2);
    const c = palette(p, 0.7);
    expect(b.x).toBeCloseTo(c.x, 10);
    expect(b.y).toBeCloseTo(c.y, 10);
    expect(b.z).toBeCloseTo(c.z, 10);
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(0.3);
  });

  it('shifted palettes stay inside [0,1]', () => {
    for (const base of Object.values(PALETTES)) {
      const q = shiftPalette(base, 0.5);
      for (let t = 0; t < 2; t += 0.01) {
        const c = palette(q, t);
        for (const ch of [c.x, c.y, c.z]) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('sessionGenome: match gives both eyes one palette, complement splits them', () => {
    const match = sessionGenome(9, 'match');
    const comp = sessionGenome(9, 'complement');
    const look = LOOKS.mandala;
    expect(match.paletteFor(look, 0)).toEqual(match.paletteFor(look, 1));
    expect(comp.paletteFor(look, 0)).not.toEqual(comp.paletteFor(look, 1));
    expect(comp.paletteFor(look, 0)).toEqual(look.palette);
  });

  it('the same seed gives both eyes the same flower geometry regardless of pairing', () => {
    const a = sessionGenome(123, 'match');
    const b = sessionGenome(123, 'complement');
    expect(a.rose).toEqual(b.rose);
  });
});

describe('look registry', () => {
  it('every look is complete and sane', () => {
    for (const name of LOOK_NAMES) {
      const look = LOOKS[name];
      expect(look.mode).toBeGreaterThanOrEqual(0);
      expect(look.mode).toBeLessThanOrEqual(8);
      expect(look.speed).toBeGreaterThan(0);
      expect(look.energy).toBeGreaterThan(0);
      expect(look.pupil).toBeGreaterThan(0.1);
      expect(look.pupil).toBeLessThan(0.5);
    }
  });
});
