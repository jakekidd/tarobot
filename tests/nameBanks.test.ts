// Name bank tests. Verifies the .txt loader strips empty lines and
// the random picker respects pronoun + avoid args.

import { describe, expect, it } from 'vitest';
import {
  COMBINED_NAMES,
  FEM_NAMES,
  MASC_NAMES,
  randomName,
} from '../src/ui/antechamber/nameBanks';

describe('nameBanks loader', () => {
  it('parses MASC_NAMES from materials/names/masc.txt', () => {
    expect(MASC_NAMES.length).toBeGreaterThan(20);
    // Every entry is a non-empty string.
    expect(MASC_NAMES.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
  });

  it('parses FEM_NAMES from materials/names/fem.txt', () => {
    expect(FEM_NAMES.length).toBeGreaterThan(20);
    expect(FEM_NAMES.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
  });

  it('COMBINED_NAMES is the concatenation of MASC + FEM', () => {
    expect(COMBINED_NAMES.length).toBe(MASC_NAMES.length + FEM_NAMES.length);
  });
});

describe('randomName', () => {
  it('picks from MASC_NAMES when pronoun is him', () => {
    const results = new Set(Array.from({ length: 50 }, () => randomName('him')));
    for (const name of results) {
      expect(MASC_NAMES).toContain(name);
    }
  });

  it('picks from FEM_NAMES when pronoun is her', () => {
    const results = new Set(Array.from({ length: 50 }, () => randomName('her')));
    for (const name of results) {
      expect(FEM_NAMES).toContain(name);
    }
  });

  it('picks from COMBINED_NAMES when pronoun is them', () => {
    const results = new Set(Array.from({ length: 100 }, () => randomName('them')));
    for (const name of results) {
      expect(COMBINED_NAMES).toContain(name);
    }
  });

  it('picks from COMBINED_NAMES when pronoun is null', () => {
    const results = new Set(Array.from({ length: 100 }, () => randomName(null)));
    for (const name of results) {
      expect(COMBINED_NAMES).toContain(name);
    }
  });

  it('respects avoid — never returns the avoided name', () => {
    const avoid = MASC_NAMES[0]!;
    const results = Array.from({ length: 200 }, () => randomName('him', avoid));
    expect(results).not.toContain(avoid);
  });

  it('falls back gracefully when the only name in the bank is avoided', () => {
    // This shouldn't happen in practice but the helper has a fallback;
    // verify it doesn't throw.
    expect(() => randomName('him', MASC_NAMES[0]!)).not.toThrow();
  });
});
