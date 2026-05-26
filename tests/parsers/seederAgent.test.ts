// Haiku-seeder agent parser tests (parseSeederLines).
//
// Distinct from the deterministic algorithmic seeder in
// src/pipeline/survey/seeder.ts (which is covered by tests/seeder.test.ts).
// This parser cleans the Haiku output — strips bullets, dedupes,
// drops empty lines.

import { describe, expect, it } from 'vitest';
import { parseSeederLines } from '../../src/pipeline/survey/agents/seeder';

describe('parseSeederLines', () => {
  it('returns an empty array on empty input', () => {
    expect(parseSeederLines('')).toEqual([]);
    expect(parseSeederLines('\n\n\n')).toEqual([]);
  });

  it('returns one entry per non-empty line', () => {
    const raw = `picked freedom over security
slow latency on the body question
hesitated then picked the loudest answer`;
    expect(parseSeederLines(raw)).toEqual([
      'picked freedom over security',
      'slow latency on the body question',
      'hesitated then picked the loudest answer',
    ]);
  });

  it('strips leading bullets / dashes / midline-dots', () => {
    const raw = `- bullet observation
* star observation
• unicode bullet
· middot bullet`;
    expect(parseSeederLines(raw)).toEqual([
      'bullet observation',
      'star observation',
      'unicode bullet',
      'middot bullet',
    ]);
  });

  it('strips leading numbered prefixes (1. / 2)', () => {
    const raw = `1. first observation
2) second observation
3.  third observation`;
    expect(parseSeederLines(raw)).toEqual([
      'first observation',
      'second observation',
      'third observation',
    ]);
  });

  it('deduplicates identical lines', () => {
    const raw = `same observation
same observation
different observation
same observation`;
    expect(parseSeederLines(raw)).toEqual(['same observation', 'different observation']);
  });

  it('handles indentation gracefully (trim first)', () => {
    const raw = `    indented observation
        deeply indented`;
    expect(parseSeederLines(raw)).toEqual(['indented observation', 'deeply indented']);
  });

  it('preserves periods + commas in body text (no truncation)', () => {
    const raw = 'maren said "less the job, more what staying says about me." — entry 4';
    expect(parseSeederLines(raw)).toEqual([
      'maren said "less the job, more what staying says about me." — entry 4',
    ]);
  });

  it('does NOT impose a max length (silent design choice — observations can be sentences)', () => {
    const longLine = 'an observation that runs on and on and on '.repeat(8).trim();
    expect(parseSeederLines(longLine)).toEqual([longLine]);
  });
});
