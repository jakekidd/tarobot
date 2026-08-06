// The moving parts: how gaze is spent between turning the eye body
// and sliding the pupil, and how the optic cords behave.

import { describe, expect, it } from 'vitest';
import {
  CORD,
  MOTION,
  cordRadius,
  cordSway,
  peristalsis,
  pupilOffset,
  splitGaze,
} from '../src/leyebrary/math';

describe('splitGaze', () => {
  it('bodyShare 0 spends everything on the pupil', () => {
    const s = splitGaze(0.6, 0.3, 1, 0, 0.3);
    expect(s.bodyYaw).toBe(0);
    expect(s.bodyPitch).toBe(0);
    const full = pupilOffset(0.6, 0.3, 1, 0.3);
    expect(s.pupil.x).toBeCloseTo(full.x, 10);
    expect(s.pupil.y).toBeCloseTo(full.y, 10);
  });

  it('bodyShare 1 spends everything on the body', () => {
    const s = splitGaze(0.6, 0.3, 1, 1, 0.3);
    expect(s.pupil.x).toBe(0);
    expect(s.pupil.y).toBe(0);
    expect(Math.abs(s.bodyYaw)).toBeGreaterThan(0.01);
  });

  it('the split is a partition — shares sum to the whole', () => {
    const gx = 0.7;
    const gy = -0.25;
    const share = 0.4;
    const split = splitGaze(gx, gy, 1, share, 0.3);
    const all = pupilOffset(gx, gy, 1, 0.3);
    const body = splitGaze(gx, gy, 1, 1, 0.3);
    expect(split.pupil.x).toBeCloseTo(all.x * (1 - share), 10);
    expect(split.bodyYaw).toBeCloseTo(body.bodyYaw * share, 10);
  });

  it('body angles carry the sign of the gaze and grow with eccentricity', () => {
    const near = splitGaze(0.2, 0, 1, 1);
    const far = splitGaze(0.9, 0, 1, 1);
    expect(near.bodyYaw).toBeGreaterThan(0);
    expect(far.bodyYaw).toBeGreaterThan(near.bodyYaw);
    expect(splitGaze(-0.9, 0, 1, 1).bodyYaw).toBeLessThan(0);
    expect(splitGaze(0, 0.9, 1, 1).bodyPitch).toBeGreaterThan(0);
  });

  it('never swings the body past the swing cap (no eyes turning inside out)', () => {
    for (let gx = -4; gx <= 4; gx += 0.25) {
      for (let gy = -4; gy <= 4; gy += 0.5) {
        const s = splitGaze(gx, gy, 0.05, 1);
        const cap = (Math.PI / 2) * MOTION.bodySwing + 1e-9;
        expect(Math.abs(s.bodyYaw)).toBeLessThanOrEqual(cap);
        expect(Math.abs(s.bodyPitch)).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('a dead-ahead gaze moves nothing', () => {
    const s = splitGaze(0, 0, 1, MOTION.bodyShare);
    expect(s.bodyYaw).toBeCloseTo(0, 12);
    expect(s.bodyPitch).toBeCloseTo(0, 12);
    expect(Math.hypot(s.pupil.x, s.pupil.y)).toBeCloseTo(0, 12);
  });
});

describe('the cords', () => {
  it('peristalsis is a travelling wave: advancing time shifts it along the cord', () => {
    // the wave moves toward the socket, so a point further along sees
    // the same phase earlier
    const du = 0.1;
    const dt = (du * CORD.peristalsisFreq) / CORD.peristalsisSpeed;
    const a = peristalsis(0.4, 0);
    const b = peristalsis(0.4 - du, dt);
    expect(a).toBeCloseTo(b, 8);
  });

  it('peristalsis stays in [-1,1]', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      for (let t = 0; t < 6; t += 0.3) {
        const v = peristalsis(u, t);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the cord tapers toward the far end on average', () => {
    const mean = (u: number): number => {
      let sum = 0;
      let n = 0;
      for (let t = 0; t < 12; t += 0.05) {
        sum += cordRadius(u, t);
        n++;
      }
      return sum / n;
    };
    expect(mean(0)).toBeGreaterThan(mean(0.5));
    expect(mean(0.5)).toBeGreaterThan(mean(1));
  });

  it('the cord never pinches shut or inverts', () => {
    for (let u = 0; u <= 1; u += 0.02) {
      for (let t = 0; t < 8; t += 0.2) {
        expect(cordRadius(u, t)).toBeGreaterThan(0);
      }
    }
  });

  it('sway is welded at the socket and free at the far end', () => {
    for (let t = 0; t < 20; t += 0.7) {
      const at0 = cordSway(0, t);
      expect(Math.hypot(at0.x, at0.y)).toBeCloseTo(0, 12);
    }
    let maxFar = 0;
    for (let t = 0; t < 40; t += 0.1) {
      maxFar = Math.max(maxFar, Math.hypot(cordSway(1, t).x, cordSway(1, t).y));
    }
    expect(maxFar).toBeGreaterThan(CORD.swayAmp * 0.5);
  });

  it('sway grows monotonically along the cord', () => {
    const t = 3.3;
    let prev = -1;
    for (let u = 0; u <= 1; u += 0.1) {
      const s = cordSway(u, t);
      const mag = Math.hypot(s.x, s.y);
      expect(mag).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = mag;
    }
  });
});
