// The classification layer and the arousal law — the two pieces the
// show drives directly, so they are the two that must not surprise it.

import { describe, expect, it } from 'vitest';
import {
  AROUSAL,
  arousalDecay,
  arousalDilation,
  arousalStep,
} from '../src/leyebrary/math';
import {
  BEAT_INTENT,
  THINKING_CYCLE,
  THINK_DWELL,
  intentOfBeat,
  moodBreath,
  moodFade,
  moodLook,
  sameMood,
  thinkingLook,
  type EyeMood,
} from '../src/leyebrary/mood';
import { LOOKS } from '../src/leyebrary/looks';

describe('arousal', () => {
  it('diminishes: each keystroke moves it less than the last', () => {
    let a = 0;
    let prevStep = Infinity;
    for (let i = 0; i < 25; i++) {
      const next = arousalStep(a);
      const step = next - a;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(prevStep);
      prevStep = step;
      a = next;
    }
  });

  it('is bounded — no amount of typing turns the eye into a saucer', () => {
    let a = 0;
    for (let i = 0; i < 10000; i++) a = arousalStep(a);
    expect(a).toBeLessThan(1);
    expect(arousalDilation(a)).toBeLessThanOrEqual(AROUSAL.dilate + 1e-12);
  });

  it('decays on its half-life, and all the way back to rest', () => {
    const a = 0.8;
    expect(arousalDecay(a, AROUSAL.halfLife)).toBeCloseTo(a / 2, 10);
    expect(arousalDecay(a, AROUSAL.halfLife * 2)).toBeCloseTo(a / 4, 10);
    let v = a;
    for (let t = 0; t < 60; t += 0.1) v = arousalDecay(v, 0.1);
    expect(v).toBeLessThan(1e-6);
  });

  it('decay is frame-rate independent — same wall time, same result', () => {
    let coarse = 0.9;
    let fine = 0.9;
    for (let i = 0; i < 10; i++) coarse = arousalDecay(coarse, 0.1);
    for (let i = 0; i < 100; i++) fine = arousalDecay(fine, 0.01);
    expect(coarse).toBeCloseTo(fine, 10);
  });

  it('dilation is proportional and never negative', () => {
    expect(arousalDilation(0)).toBe(0);
    expect(arousalDilation(-5)).toBe(0);
    expect(arousalDilation(1)).toBeCloseTo(AROUSAL.dilate, 12);
  });
});

describe('beat → intent', () => {
  it('every grammar beat maps to an intent', () => {
    const beats = [
      'greeting', 'question', 'guess', 'rant_bid', 'focus', 'deal',
      'flip_invite', 'read', 'naming', 'honor', 'charm', 'quest',
      'close', 'hold', 'tissue', 'talk',
    ];
    for (const b of beats) {
      expect(BEAT_INTENT[b], `beat ${b} unmapped`).toBeDefined();
      expect(intentOfBeat(b)).toBe(BEAT_INTENT[b]);
    }
    expect(Object.keys(BEAT_INTENT).length).toBe(beats.length);
  });

  it('an unknown or missing beat falls back to holding, never crashes', () => {
    expect(intentOfBeat(null)).toBe('hold');
    expect(intentOfBeat(undefined)).toBe('hold');
    expect(intentOfBeat('some_future_beat')).toBe('hold');
  });
});

describe('mood → look', () => {
  it('every mood resolves to a real registered look', () => {
    const moods: EyeMood[] = [
      { kind: 'listening' },
      { kind: 'thinking' },
      { kind: 'closed' },
      ...(['greet', 'probe', 'reveal', 'name', 'close', 'hold'] as const).map(
        (intent) => ({ kind: 'speaking', intent }) as EyeMood,
      ),
    ];
    for (const m of moods) {
      const look = moodLook(m, 0);
      expect(LOOKS[look], `${JSON.stringify(m)} → ${look}`).toBeDefined();
      expect(moodFade(m)).toBeGreaterThan(0);
      expect(moodBreath(m)).toBeGreaterThan(0);
    }
  });

  it('thinking cycles so a long call never freezes the face', () => {
    const seen = new Set<string>();
    for (let t = 0; t < THINK_DWELL * THINKING_CYCLE.length; t += 0.5) {
      seen.add(thinkingLook(t));
    }
    expect(seen.size).toBe(THINKING_CYCLE.length);
    // and it wraps rather than running off the end
    expect(thinkingLook(THINK_DWELL * THINKING_CYCLE.length + 0.1)).toBe(THINKING_CYCLE[0]);
    expect(thinkingLook(-5)).toBe(THINKING_CYCLE[0]);
  });

  it('thinking holds each look for the full dwell — no strobing', () => {
    const first = thinkingLook(0.01);
    expect(thinkingLook(THINK_DWELL - 0.01)).toBe(first);
    expect(thinkingLook(THINK_DWELL + 0.01)).not.toBe(first);
    // the dwell is far slower than any flicker-hazard rate
    expect(THINK_DWELL).toBeGreaterThan(1);
  });

  it('listening is the quietest look — she does not perform while you type', () => {
    expect(moodLook({ kind: 'listening' })).toBe('nebula');
    expect(LOOKS.nebula.energy).toBeLessThan(LOOKS.vision.energy);
  });

  it('sameMood distinguishes speech intents but ignores irrelevant detail', () => {
    expect(sameMood({ kind: 'listening' }, { kind: 'listening' })).toBe(true);
    expect(sameMood({ kind: 'thinking' }, { kind: 'listening' })).toBe(false);
    expect(
      sameMood({ kind: 'speaking', intent: 'probe' }, { kind: 'speaking', intent: 'probe' }),
    ).toBe(true);
    expect(
      sameMood({ kind: 'speaking', intent: 'probe' }, { kind: 'speaking', intent: 'reveal' }),
    ).toBe(false);
  });
});
