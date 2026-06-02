// Seeder tests. Pure parser — no LLM call. Verify the three
// inversion-text styles all parse correctly, the fork between-encoding
// emits both poles + stuck claim, and the aging helper bumps
// age_in_turns on tentative + held.

import { describe, expect, it } from 'vitest';
import {
  ageHeldProbes,
  generateSeeds,
  parseInversionMatches,
} from '../src/pipeline/antechamber/seeder';
import type { TreeNode } from '../src/pipeline/antechamber/types';
import type { Probe } from '../src/pipeline/antechamber/living-doc';

describe('parseInversionMatches', () => {
  it('matches the value-style: "love → fear of being unlovable; freedom → fear ..."', () => {
    const text = 'strong values invert to fears — love → fear of being unlovable; freedom → fear of constraint; wisdom → fear of being deceived.';
    expect(parseInversionMatches(text, 'love')).toEqual(['fear of being unlovable']);
    expect(parseInversionMatches(text, 'freedom')).toEqual(['fear of constraint']);
    expect(parseInversionMatches(text, 'wisdom')).toEqual(['fear of being deceived']);
  });

  it('matches the decision-style: "mind = deliberate / analytic — may intellectualize."', () => {
    const text = 'mind = deliberate / analytic — may intellectualize feeling. heart = emotional / valuational — may sacrifice clarity. gut = intuitive / felt — may not articulate.';
    expect(parseInversionMatches(text, 'mind')).toEqual(['deliberate / analytic — may intellectualize feeling']);
    expect(parseInversionMatches(text, 'heart')).toEqual(['emotional / valuational — may sacrifice clarity']);
    expect(parseInversionMatches(text, 'gut')).toEqual(['intuitive / felt — may not articulate']);
  });

  it('handles fork "between:left/right" — both seeds + stuck claim', () => {
    const text = 'bet = there is a leap they keep not taking; hold = there is a leap they keep almost taking.';
    const seeds = parseInversionMatches(text, 'between:bet/hold');
    expect(seeds).toContain('there is a leap they keep not taking');
    expect(seeds).toContain('there is a leap they keep almost taking');
    expect(seeds.some((s) => /stuck on the bet\/hold fork/.test(s))).toBe(true);
  });

  it('returns empty for an answer that does not match any pair', () => {
    const text = 'mind = deliberate. heart = emotional.';
    expect(parseInversionMatches(text, 'logic')).toEqual([]);
  });

  it('returns empty for empty inversion text', () => {
    expect(parseInversionMatches('', 'love')).toEqual([]);
  });

  it('matches even when the optionPart has a preamble before the actual label', () => {
    // The "strong values invert to corresponding fears — love →" case:
    // option is the LAST token after splitting on whitespace/em-dash.
    const text = 'strong values invert to corresponding fears — love → fear of being unlovable.';
    expect(parseInversionMatches(text, 'love')).toEqual(['fear of being unlovable']);
  });

  it('handles mixed separators (semicolons + periods in same probe)', () => {
    // The 9-fork pillar uses both `;` and `.` between pairs.
    const text = 'each pick seeds a suspicion. bet = leap not taken; hold = leap almost taken. stay = exit not seen; go = commitment psychologically left.';
    expect(parseInversionMatches(text, 'bet')).toEqual(['leap not taken']);
    expect(parseInversionMatches(text, 'stay')).toEqual(['exit not seen']);
  });
});

describe('generateSeeds', () => {
  const valueNode: TreeNode = {
    topic: 'self',
    q: 'which of these do you value most?',
    f: 'choice',
    a: [['love'], ['freedom'], ['wisdom']],
    probe: {
      surface: 'what they sacrifice others for.',
      inversions: 'love → fear of being unlovable; freedom → fear of constraint; wisdom → fear of being deceived.',
      watch_for: 'cross-reference.',
    },
  };

  it('emits a Probe with the right shape', () => {
    const seeds = generateSeeds(valueNode, 'love', 5, 'value_most');
    expect(seeds).toHaveLength(1);
    const seed = seeds[0]!;
    expect(seed.claim).toBe('fear of being unlovable');
    expect(seed.source).toBe('seeder');
    expect(seed.born_turn).toBe(5);
    expect(seed.age_in_turns).toBe(0);
    expect(seed.id).toMatch(/^seed-value_most-/);
  });

  it('produces stable ids based on source + claim', () => {
    const a = generateSeeds(valueNode, 'love', 1, 'value_most');
    const b = generateSeeds(valueNode, 'love', 1, 'value_most');
    expect(a[0]!.id).toBe(b[0]!.id);
  });

  it('returns empty array when probe is undefined', () => {
    const node: TreeNode = { topic: 'now', q: 'q?', f: 'choice' };
    expect(generateSeeds(node, 'whatever', 1, 'n')).toEqual([]);
  });

  it('returns empty when inversions field is missing', () => {
    const node: TreeNode = {
      topic: 'now',
      q: 'q?',
      f: 'choice',
      probe: { surface: 'only surface, no inversions' },
    };
    expect(generateSeeds(node, 'anything', 1, 'n')).toEqual([]);
  });

  it('joins an array answer (multi-select) into a single match string', () => {
    const seeds = generateSeeds(valueNode, ['love'], 3, 'value_most');
    expect(seeds.map((s) => s.claim)).toEqual(['fear of being unlovable']);
  });

  it('for fork between-encoding, emits seeds for BOTH sides + stuck claim', () => {
    const forkNode: TreeNode = {
      topic: 'now',
      q: 'fork?',
      f: 'fork',
      probe: {
        inversions: 'bet = leap not taken; hold = leap almost taken.',
      },
    };
    const seeds = generateSeeds(forkNode, 'between:bet/hold', 1, 'fork');
    const claims = seeds.map((s) => s.claim);
    expect(claims).toContain('leap not taken');
    expect(claims).toContain('leap almost taken');
    expect(claims.some((c) => /stuck on the bet\/hold fork/.test(c))).toBe(true);
  });
});

describe('ageHeldProbes', () => {
  const p = (id: string, age: number): Probe => ({
    id,
    claim: id,
    source: 'seeder',
    born_turn: 0,
    age_in_turns: age,
  });

  it('bumps age_in_turns by 1 on every held probe', () => {
    const result = ageHeldProbes([p('a', 0), p('b', 5), p('c', 10)]);
    expect(result.map((x) => x.age_in_turns)).toEqual([1, 6, 11]);
  });

  it('returns a new array, does not mutate input', () => {
    const orig = [p('a', 0)];
    const result = ageHeldProbes(orig);
    expect(orig[0]!.age_in_turns).toBe(0);  // untouched
    expect(result).not.toBe(orig);          // new array ref
  });
});
