// Mantra sanitizer tests. The mantra is meant to be ticker-tape-
// printable: no markdown, no emoji, no quotes, no surrounding
// preambles. The sanitizer is the safety net for whatever the model
// happened to emit.

import { describe, expect, it } from 'vitest';
import { generateMantra, sanitizeMantra } from '../src/pipeline/seer/mantra';
import type { Profile } from '../src/pipeline/types';
import { FakeAdapter } from './fakeAdapter';

describe('sanitizeMantra', () => {
  it('strips surrounding double quotes', () => {
    expect(sanitizeMantra('"begin before you are ready"')).toBe('begin before you are ready');
  });

  it('strips surrounding single quotes', () => {
    expect(sanitizeMantra("'the door is the door'")).toBe('the door is the door');
  });

  it('strips a "mantra:" preamble', () => {
    expect(sanitizeMantra('mantra: the silence is the room')).toBe('the silence is the room');
  });

  it('strips "the mantra is" preamble case-insensitive', () => {
    expect(sanitizeMantra('The Mantra Is: hello world')).toBe('hello world');
  });

  it('strips "here is the mantra" preamble', () => {
    expect(sanitizeMantra('here is the mantra — keep going')).toBe('keep going');
  });

  it('strips markdown emphasis markers (asterisks + underscores)', () => {
    expect(sanitizeMantra('*the* _door_ is *the* _door_')).toBe('the door is the door');
  });

  it('strips emoji', () => {
    expect(sanitizeMantra('begin before you are ready 🌙✨')).toBe('begin before you are ready');
  });

  it('collapses internal newlines to spaces', () => {
    expect(sanitizeMantra('first line\n  second line\n  third')).toBe('first line second line third');
  });

  it('hard-caps output at 120 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeMantra(long).length).toBeLessThanOrEqual(120);
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeMantra('   hello world   ')).toBe('hello world');
  });

  it('passes through a clean valid mantra unchanged', () => {
    const clean = 'what you cling to in the dissolution will limit the consolidation';
    expect(sanitizeMantra(clean)).toBe(clean);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeMantra('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeMantra('   \n   \t   ')).toBe('');
  });
});

describe('generateMantra', () => {
  const minimalProfile: Profile = {
    identity: { name: 'jake' },
    cast: [],
    candidates: [],
    hunches: [],
    threads: [],
    margin: {},
    highlights: [],
    cognition_log: [],
    brief: '',
    ready_to_close: false,
    version: 1,
  };

  it('calls invokeFreeform and returns sanitized text', async () => {
    const adapter = new FakeAdapter().setFreeformValue(
      '"begin before you are ready" 🌙',
    );
    const out = await generateMantra(adapter, {
      profile: minimalProfile,
      intention: 'should i go?',
      revealed: [],
      chat: [],
      closing_takeaway: 'the door is open',
    });
    expect(out).toBe('begin before you are ready');
    expect(adapter.freeformCalls).toHaveLength(1);
  });

  it('returns empty string when adapter throws', async () => {
    const adapter = new FakeAdapter().setFreeform(() => {
      throw new Error('boom');
    });
    const out = await generateMantra(adapter, {
      profile: minimalProfile,
      intention: 'anything',
      revealed: [],
      chat: [],
      closing_takeaway: '',
    });
    expect(out).toBe('');
  });

  it('passes story + transcript + intention through to the payload', async () => {
    const adapter = new FakeAdapter().setFreeformValue('clean mantra');
    await generateMantra(adapter, {
      profile: minimalProfile,
      story: { fork: { a: 'leave', b: 'stay', is_stasis: false }, present_pressure: null, past_root: null, stakes: null, hooks: [] },
      intention: 'should i leave?',
      revealed: [],
      chat: [],
      closing_takeaway: 'the door is open',
    });
    expect(adapter.freeformCalls).toHaveLength(1);
    const userPayload = JSON.parse(adapter.freeformCalls[0]!.user);
    expect(userPayload.intention).toBe('should i leave?');
    expect(userPayload.closing_takeaway).toBe('the door is open');
    expect(userPayload.story?.fork?.a).toBe('leave');
  });

  it('uses model tier "cognition"', async () => {
    const adapter = new FakeAdapter().setFreeformValue('m');
    await generateMantra(adapter, {
      profile: minimalProfile,
      intention: 'q',
      revealed: [],
      chat: [],
      closing_takeaway: 't',
    });
    expect(adapter.freeformCalls[0]!.model).toBe('cognition');
  });
});
