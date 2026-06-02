// Return-lines tests. The parser reads materials/mascot/return-lines.md
// at boot (via ?raw) so these tests run against the actual content
// shipped in production.

import { describe, expect, it } from 'vitest';
import { pickReturnLine, RETURN_LINES } from '../src/pipeline/antechamber/return-lines';

describe('pickReturnLine', () => {
  it('returns one of the with-name templates when name is given', () => {
    const line = pickReturnLine('jake');
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
    // Either the name is interpolated OR an anon line was returned —
    // the implementation prefers with-name when name is given.
    // We verify at least that the substitution mechanism works:
    if (line.includes('{name}')) {
      throw new Error('{name} placeholder was not substituted');
    }
  });

  it('lowercases the name when substituting', () => {
    // Run multiple times — at least one with-name template should
    // include the lowercased name.
    const lines = Array.from({ length: 30 }, () => pickReturnLine('JAKE'));
    const containsLowercased = lines.some((l) => l.includes('jake'));
    expect(containsLowercased).toBe(true);
  });

  it('uses anonymous templates when no name is given', () => {
    const line = pickReturnLine(undefined);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
    expect(line).not.toMatch(/\{name\}/);
  });

  it('handles empty-string name as anonymous', () => {
    const lines = Array.from({ length: 30 }, () => pickReturnLine(''));
    // None should contain {name} (no substitution attempted)
    expect(lines.every((l) => !l.includes('{name}'))).toBe(true);
  });

  it('handles whitespace-only name as anonymous', () => {
    const line = pickReturnLine('   ');
    expect(line).not.toMatch(/\{name\}/);
  });
});

describe('RETURN_LINES content', () => {
  it('has at least one template with {name} placeholder', () => {
    expect(RETURN_LINES.TEMPLATES_WITH_NAME.some((t) => t.includes('{name}'))).toBe(true);
  });

  it('has at least one anonymous template', () => {
    expect(RETURN_LINES.TEMPLATES_ANON.length).toBeGreaterThan(0);
  });
});
