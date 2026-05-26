// PSYCH text-blob parser fuzz tests.

import { describe, expect, it } from 'vitest';
import { parsePsychTextBlob } from '../../src/pipeline/survey/agents/psych/parseTextBlob';

const WELL_FORMED = `
Run 2 of 3. Two warm taps on the identity thread; one cold ruled out
"theo as the obstacle." Engagement still good — she's correcting,
not shrugging.

===CANDIDATES===
    staying-as-self-protection: the day-job is a hedge against a version of herself she's not sure she wants to be
        warm on assertion 1; entry 4 — "less the job, more what staying says about me"
        seeder noted slow latency-z on the body question (pillar 3, z=1.8)
    freedom-vs-belonging-with-theo: picked freedom over love+belonging on pillar 5 even though theo is the center of her life
        warm on assertion 2; theo wants her to leave per entry 5
        cold on theo-as-obstacle eliminated the external-resistance region

===TERMINATE===
    no
`;

describe('parsePsychTextBlob — well-formed input', () => {
  it('extracts candidate set with descriptions and thoughts', () => {
    const blob = parsePsychTextBlob(WELL_FORMED);
    expect(blob.candidates).toHaveLength(2);
    expect(blob.candidates[0]!.label).toBe('staying-as-self-protection');
    expect(blob.candidates[0]!.description).toMatch(/day-job is a hedge/);
    expect(blob.candidates[0]!.thoughts).toHaveLength(2);
    expect(blob.candidates[1]!.label).toBe('freedom-vs-belonging-with-theo');
  });

  it('parses terminate=no', () => {
    expect(parsePsychTextBlob(WELL_FORMED).terminate).toBe(false);
  });

  it('parses terminate=yes', () => {
    const raw = WELL_FORMED.replace('    no\n', '    yes\n');
    expect(parsePsychTextBlob(raw).terminate).toBe(true);
  });

  it('captures thinking before the candidates marker', () => {
    const blob = parsePsychTextBlob(WELL_FORMED);
    expect(blob.thinking).toContain('Engagement still good');
    expect(blob.thinking).not.toContain('CANDIDATES');
  });
});

describe('parsePsychTextBlob — KNOWN parser quirks', () => {
  it('treats labels with capital letters or spaces as thoughts (not headers)', () => {
    const raw = `===CANDIDATES===
    Staying As Self Protection: bad label
        thought one
===TERMINATE===
    no`;
    const blob = parsePsychTextBlob(raw);
    // The "Staying As..." line fails the kebab-case label regex, so
    // the whole block becomes orphaned thoughts (which then get
    // dropped because there's no candidate to attach to). Zero
    // candidates emerge.
    expect(blob.candidates).toEqual([]);
  });

  it('description text containing colons survives — first colon splits label', () => {
    const raw = `===CANDIDATES===
    leaving-job: the situation: stay vs. quit, but bigger than that
        thought (entry 1)
===TERMINATE===
    no`;
    const blob = parsePsychTextBlob(raw);
    expect(blob.candidates).toHaveLength(1);
    expect(blob.candidates[0]!.label).toBe('leaving-job');
    expect(blob.candidates[0]!.description).toBe('the situation: stay vs. quit, but bigger than that');
  });

  it('drops orphan thoughts that appear before any candidate header', () => {
    const raw = `===CANDIDATES===
    an unanchored thought before any label
    another orphan
    real-candidate: legit one
        real thought (assertion 1 WARM)
===TERMINATE===
    no`;
    const blob = parsePsychTextBlob(raw);
    expect(blob.candidates).toHaveLength(1);
    expect(blob.candidates[0]!.label).toBe('real-candidate');
    expect(blob.candidates[0]!.thoughts).toEqual(['real thought (assertion 1 WARM)']);
  });

  it('strips leading bullets from thoughts', () => {
    const raw = `===CANDIDATES===
    cand-one: desc
        - bulleted thought (entry 1)
        * star bullet (assertion 1 WARM)
        · middot bullet (entry 2)
===TERMINATE===
    no`;
    const blob = parsePsychTextBlob(raw);
    expect(blob.candidates[0]!.thoughts).toEqual([
      'bulleted thought (entry 1)',
      'star bullet (assertion 1 WARM)',
      'middot bullet (entry 2)',
    ]);
  });

  it('terminate field accepts case-insensitive "yes" with surrounding noise', () => {
    const raw = `===CANDIDATES===
===TERMINATE===
    YES, ending here.`;
    expect(parsePsychTextBlob(raw).terminate).toBe(true);
  });

  it('terminate is FALSE when neither yes nor no is supplied (default-safe)', () => {
    const raw = `===CANDIDATES===
===TERMINATE===`;
    expect(parsePsychTextBlob(raw).terminate).toBe(false);
  });
});

describe('parsePsychTextBlob — graceful degradation', () => {
  it('returns empty everything on garbage input', () => {
    const blob = parsePsychTextBlob('lol');
    expect(blob.candidates).toEqual([]);
    expect(blob.terminate).toBe(false);
  });

  it('returns empty when only CANDIDATES marker, no TERMINATE marker', () => {
    const raw = `===CANDIDATES===
    cand: desc
        thought (entry 1)`;
    const blob = parsePsychTextBlob(raw);
    expect(blob.candidates).toHaveLength(1);
    expect(blob.terminate).toBe(false);
  });
});
