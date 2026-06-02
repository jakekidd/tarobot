// WEAVER text-blob parser fuzz tests.

import { describe, expect, it } from 'vitest';
import { parseWeaverTextBlob } from '../../src/pipeline/antechamber/agents/weaver/parseTextBlob';

const WELL_FORMED = `
Run 2 of 3. Two warm taps on the identity thread; one cold ruled out
"theo as the obstacle." Engagement still good — she's correcting,
not shrugging.

===CANDIDATES===
    staying-as-self-protection: the day-job is a hedge against a version of herself she's not sure she wants to be
        warm on guess 1; entry 4 — "less the job, more what staying says about me"
        pillar 3 (z=1.8) suggests intellectualizing the choice
    freedom-vs-belonging-with-theo: picked freedom over love+belonging on pillar 5 even though theo is the center of her life
        warm on guess 2; theo wants her to leave per entry 5
        cold on theo-as-obstacle eliminated the external-resistance region

===ENGAGEMENT===
    live
`;

describe('parseWeaverTextBlob — well-formed input', () => {
  it('extracts candidate set with descriptions and thoughts', () => {
    const blob = parseWeaverTextBlob(WELL_FORMED);
    expect(blob.candidates).toHaveLength(2);
    expect(blob.candidates[0]!.label).toBe('staying-as-self-protection');
    expect(blob.candidates[0]!.description).toMatch(/day-job is a hedge/);
    expect(blob.candidates[0]!.thoughts).toHaveLength(2);
    expect(blob.candidates[1]!.label).toBe('freedom-vs-belonging-with-theo');
  });

  it('parses engagement=live', () => {
    expect(parseWeaverTextBlob(WELL_FORMED).engagement).toBe('live');
  });

  it('parses engagement=wind_down (underscore form)', () => {
    const raw = WELL_FORMED.replace('    live\n', '    wind_down\n');
    expect(parseWeaverTextBlob(raw).engagement).toBe('wind_down');
  });

  it('parses engagement=wind-down (hyphen form, model variability)', () => {
    const raw = WELL_FORMED.replace('    live\n', '    wind-down\n');
    expect(parseWeaverTextBlob(raw).engagement).toBe('wind_down');
  });

  it('parses engagement=flat', () => {
    const raw = WELL_FORMED.replace('    live\n', '    flat\n');
    expect(parseWeaverTextBlob(raw).engagement).toBe('flat');
  });

  it('captures thinking before the candidates marker', () => {
    const blob = parseWeaverTextBlob(WELL_FORMED);
    expect(blob.thinking).toContain('Engagement still good');
    expect(blob.thinking).not.toContain('CANDIDATES');
  });
});

describe('parseWeaverTextBlob — legacy back-compat (===TERMINATE=== yes/no)', () => {
  it('legacy terminate=yes maps to engagement=flat', () => {
    const raw = `===CANDIDATES===
    cand: desc
        thought (entry 1)
===TERMINATE===
    yes`;
    expect(parseWeaverTextBlob(raw).engagement).toBe('flat');
  });

  it('legacy terminate=no maps to engagement=live', () => {
    const raw = `===CANDIDATES===
    cand: desc
        thought (entry 1)
===TERMINATE===
    no`;
    expect(parseWeaverTextBlob(raw).engagement).toBe('live');
  });
});

describe('parseWeaverTextBlob — KNOWN parser quirks', () => {
  it('treats labels with capital letters or spaces as thoughts (not headers)', () => {
    const raw = `===CANDIDATES===
    Staying As Self Protection: bad label
        thought one
===ENGAGEMENT===
    live`;
    const blob = parseWeaverTextBlob(raw);
    expect(blob.candidates).toEqual([]);
  });

  it('description text containing colons survives — first colon splits label', () => {
    const raw = `===CANDIDATES===
    leaving-job: the situation: stay vs. quit, but bigger than that
        thought (entry 1)
===ENGAGEMENT===
    live`;
    const blob = parseWeaverTextBlob(raw);
    expect(blob.candidates).toHaveLength(1);
    expect(blob.candidates[0]!.label).toBe('leaving-job');
    expect(blob.candidates[0]!.description).toBe('the situation: stay vs. quit, but bigger than that');
  });

  it('drops orphan thoughts that appear before any candidate header', () => {
    const raw = `===CANDIDATES===
    an unanchored thought before any label
    another orphan
    real-candidate: legit one
        real thought (guess 1 WARM)
===ENGAGEMENT===
    live`;
    const blob = parseWeaverTextBlob(raw);
    expect(blob.candidates).toHaveLength(1);
    expect(blob.candidates[0]!.label).toBe('real-candidate');
    expect(blob.candidates[0]!.thoughts).toEqual(['real thought (guess 1 WARM)']);
  });

  it('strips leading bullets from thoughts', () => {
    const raw = `===CANDIDATES===
    cand-one: desc
        - bulleted thought (entry 1)
        * star bullet (guess 1 WARM)
        · middot bullet (entry 2)
===ENGAGEMENT===
    live`;
    const blob = parseWeaverTextBlob(raw);
    expect(blob.candidates[0]!.thoughts).toEqual([
      'bulleted thought (entry 1)',
      'star bullet (guess 1 WARM)',
      'middot bullet (entry 2)',
    ]);
  });

  it('engagement defaults to live when neither marker present', () => {
    const raw = `===CANDIDATES===
    cand: desc
        thought (entry 1)`;
    expect(parseWeaverTextBlob(raw).engagement).toBe('live');
  });

  it('engagement defaults to live when ENGAGEMENT block is empty / malformed', () => {
    const raw = `===CANDIDATES===
===ENGAGEMENT===
    something else entirely`;
    expect(parseWeaverTextBlob(raw).engagement).toBe('live');
  });
});

describe('parseWeaverTextBlob — graceful degradation', () => {
  it('returns empty everything on garbage input', () => {
    const blob = parseWeaverTextBlob('lol');
    expect(blob.candidates).toEqual([]);
    expect(blob.engagement).toBe('live');
  });

  it('returns candidates when only CANDIDATES marker, no ENGAGEMENT marker', () => {
    const raw = `===CANDIDATES===
    cand: desc
        thought (entry 1)`;
    const blob = parseWeaverTextBlob(raw);
    expect(blob.candidates).toHaveLength(1);
    expect(blob.engagement).toBe('live');
  });
});
