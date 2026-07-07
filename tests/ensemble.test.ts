import { describe, expect, it } from 'vitest';
import { cap, carryFromScroll, fillFromLine, spend, talkRatio } from '../src/pipeline/ensemble/economy';
import { frameV1 } from '../src/pipeline/ensemble/frame';
import { Piles } from '../src/pipeline/ensemble/piles';
import { pickStallKind } from '../src/pipeline/ensemble/stall';
import {
  countWords,
  ENSEMBLE_CONSTANTS,
  type EnsembleInput,
  type ScrollEntry,
} from '../src/pipeline/ensemble/types';
import { FIXTURE_BRIEF } from '../src/pipeline/oracle/fixtures';

const C = ENSEMBLE_CONSTANTS;

function beat(speaker: 'seer' | 'visitor', text: string): ScrollEntry {
  return { kind: 'beat', speaker, text, t: 0 };
}

describe('economy', () => {
  it('fills sub-linearly and clamps at WORD_MAX', () => {
    const few = fillFromLine(0, 'one two three', C);
    const many = fillFromLine(0, Array(200).fill('word').join(' '), C);
    expect(few).toBeGreaterThan(0);
    expect(many).toBeLessThanOrEqual(C.WORD_MAX);
    expect(many - few).toBeLessThan(C.WORD_MAX); // a monologue does not buy a monologue
  });

  it('spend floors at zero', () => {
    expect(spend(5, 'a line with rather more words than five budget')).toBe(0);
  });

  it('cap rounds to 5 and clamps, with a higher floor while carrying', () => {
    expect(cap(23, false, C)).toBe(25);
    expect(cap(2, false, C)).toBe(C.CAP_MIN);
    expect(cap(200, false, C)).toBe(C.CAP_MAX);
    expect(cap(2, true, C)).toBe(C.CARRY_CAP_MIN);
  });

  it('talkRatio measures the visitor word share', () => {
    const scroll = [
      beat('seer', 'two words'),
      beat('visitor', 'six words from the visitor here'),
    ];
    expect(talkRatio(scroll, C)).toBeCloseTo(6 / 8);
    expect(talkRatio([], C)).toBe(0.5);
  });

  it('carry keys on absolute visitor underfeeding, not share', () => {
    // a verbose seer with a normally-fed visitor must NOT trip carry
    const fed = [
      beat('seer', Array(60).fill('word').join(' ')),
      beat('visitor', 'nine whole words arrive from the visitor right here'),
      beat('seer', Array(60).fill('word').join(' ')),
      beat('visitor', 'nine whole words arrive from the visitor right here'),
      beat('visitor', 'nine whole words arrive from the visitor right here'),
    ];
    expect(carryFromScroll(fed, C)).toBe(false);

    const starved = [
      beat('visitor', 'fine.'),
      beat('visitor', 'yeah.'),
      beat('visitor', 'i guess.'),
    ];
    expect(carryFromScroll(starved, C)).toBe(true);

    // too few visitor beats to judge
    expect(carryFromScroll([beat('visitor', 'hi.')], C)).toBe(false);
  });
});

describe('piles', () => {
  it('refiling supersedes the older item in the tail', () => {
    const piles = new Piles();
    const a = piles.thoughts.append('psychic', { turn: 1, beat: 1 }, { thought: 'x', confidence: 2 });
    piles.thoughts.append('psychic', { turn: 2, beat: 3 }, { thought: 'y', confidence: 1 });
    piles.thoughts.append('psychic', { turn: 3, beat: 5 }, { thought: 'x!', confidence: 3 }, a.id);
    const tail = piles.thoughts.tail(3);
    expect(tail).toHaveLength(2);
    expect(tail.map((i) => i.payload.thought)).toEqual(['y', 'x!']);
    // the record keeps everything
    expect(piles.thoughts.all()).toHaveLength(3);
  });

  it('ledger merges by label, newest from-the-mouth wins, cap evicts stalest', () => {
    const piles = new Piles();
    const anchor = { turn: 1, beat: 1 };
    piles.mergeFacts('beholder', anchor, [{ kind: 'person', label: 'the sister', note: 'older' }], 2);
    piles.mergeFacts(
      'beholder',
      anchor,
      [{ kind: 'person', label: 'The Sister', note: 'younger, actually' }],
      2,
    );
    expect(piles.ledger()).toHaveLength(1);
    expect(piles.ledger()[0].payload.note).toBe('younger, actually');

    piles.mergeFacts('beholder', anchor, [{ kind: 'state', label: 'job', note: 'leaving' }], 2);
    piles.mergeFacts('beholder', anchor, [{ kind: 'event', label: 'move', note: 'last year' }], 2);
    expect(piles.ledger()).toHaveLength(2);
  });
});

describe('stall', () => {
  it('weighted pick lands on the kind the roll selects', () => {
    const weights = { ...C.STALL_WEIGHTS };
    expect(pickStallKind(weights, () => 0)).toBe('reflect_back');
    expect(pickStallKind(weights, () => 0.999)).toBe('invite');
  });

  it('degrades safely on zeroed weights', () => {
    const zeroed = Object.fromEntries(
      Object.keys(C.STALL_WEIGHTS).map((k) => [k, 0]),
    ) as typeof C.STALL_WEIGHTS;
    expect(pickStallKind(zeroed, () => 0.5)).toBe('question_direct');
  });
});

describe('frame v1', () => {
  const docs = [{ id: 'd', name: 'test', md: '# intake', updatedAt: 0 }];

  it('chat mode omits dressings and states discovery posture', () => {
    const input: EnsembleInput = { mode: 'chat', docs, scenario: 's', taboos: ['politics'] };
    const f = frameV1(input);
    expect(f.md).not.toContain('## dressings');
    expect(f.md).toContain('## focus');
    expect(f.md).toContain('politics');
  });

  it('session mode dresses the slots as weather from the brief guides', () => {
    const input: EnsembleInput = {
      mode: 'session',
      docs,
      scenario: 's',
      brief: FIXTURE_BRIEF,
      taboos: [],
    };
    const f = frameV1(input);
    expect(f.md).toContain('## dressings');
    expect(f.md).toContain('slot 1');
    expect(f.md).toContain(FIXTURE_BRIEF.fork!.surface);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('  three little words ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});
