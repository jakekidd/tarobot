// Diviner text-blob parser fuzz tests.
//
// The diviner writes a free-form thinking pass followed by two
// labeled sections (===HYPOTHESIS===, ===GUESS===). These tests pin
// the parser's tolerance to the documented contract AND probe failure
// modes where the model could plausibly drift (e.g., lowercasing a
// marker, joining multi-line content, emitting markers in unexpected
// order).

import { describe, expect, it } from 'vitest';
import { parseDivinerTextBlob } from '../../src/pipeline/antechamber/agents/diviner/parseTextBlob';
import { blobToQueuedGuess } from '../../src/pipeline/antechamber/agents/diviner';

const WELL_FORMED = `
I've been thinking about the warmth pattern. Maren's correction on
A1 was specific — "less the job, more what staying says about me."
That's a self-identity hit, not a vocational one.

Phase is LOCATE; this is turn 2 so I need a fresh angle. The first
guess targeted identity-cost-of-staying and earned a corrected
warm. For this turn I'll swing toward time-orientation instead.

===HYPOTHESIS===
    am i more afraid of who i become if i leave than i'd admit?

===GUESS===
    the part of you that won't quit isn't afraid of theo's reaction. it's afraid of who you become if you do.
`;

describe('parseDivinerTextBlob — well-formed input', () => {
  it('extracts thinking + hypothesis + guess', () => {
    const blob = parseDivinerTextBlob(WELL_FORMED);
    expect(blob.thinking.length).toBeGreaterThan(50);
    expect(blob.hypothesis).toBe(
      "am i more afraid of who i become if i leave than i'd admit?",
    );
    expect(blob.guess).toContain('afraid of who you become');
  });

  it('preserves periods in the guess (rhythm matters)', () => {
    const raw = `===HYPOTHESIS===
    am i keeping a foot on the brake on purpose?
===GUESS===
    you keep almost-deciding. and not.`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guess).toBe('you keep almost-deciding. and not.');
  });

  it('preserves periods in the hypothesis (in-voice questions may use punctuation)', () => {
    const raw = `===HYPOTHESIS===
    is it really about the job. or about who i'd become without it.
===GUESS===
    test.`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.hypothesis).toBe(
      "is it really about the job. or about who i'd become without it.",
    );
  });

  it('joins multi-line guess content into one line', () => {
    const raw = `===HYPOTHESIS===
    am i drifting on purpose?
===GUESS===
    you have spent
    the last six months
    not quite choosing`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guess).toBe('you have spent the last six months not quite choosing');
  });

  it('tolerates HYPOTHESIS and GUESS in either order', () => {
    const raw = `===GUESS===
    you are mid-step.
===HYPOTHESIS===
    am i in the middle of a decision i won't name?`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guess).toBe('you are mid-step.');
    expect(blob.hypothesis).toBe(
      "am i in the middle of a decision i won't name?",
    );
  });
});

describe('parseDivinerTextBlob — malformed input (graceful degradation)', () => {
  it('returns empty fields when no markers are present', () => {
    const blob = parseDivinerTextBlob('just thinking, no markers anywhere');
    expect(blob.thinking).toBe('just thinking, no markers anywhere');
    expect(blob.hypothesis).toBe('');
    expect(blob.guess).toBe('');
  });

  it('returns empty for sections that appear without content', () => {
    const raw = `===HYPOTHESIS===
===GUESS===
    fine.`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.hypothesis).toBe('');
    expect(blob.guess).toBe('fine.');
  });
});

describe('parseDivinerTextBlob — KNOWN PARSER GAPS', () => {
  // Markers are case-sensitive. ===hypothesis=== would not match.
  it('marker matching is case-sensitive', () => {
    const raw = `===hypothesis===
    one
===GUESS===
    a.`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.hypothesis).toBe('');
    expect(blob.guess).toBe('a.');
  });
});

describe('blobToQueuedGuess', () => {
  it('returns a QueuedGuess with the hypothesis attached', () => {
    const blob = parseDivinerTextBlob(WELL_FORMED);
    const q = blobToQueuedGuess(blob, 5, 12);
    expect(q).not.toBeNull();
    expect(q?.idx).toBe(5);
    expect(q?.statement).toContain('afraid of who you become');
    expect(q?.hypothesis).toBe(
      "am i more afraid of who i become if i leave than i'd admit?",
    );
    expect(q?.emitted_at_turn).toBe(12);
  });

  it('returns null when the blob has no guess', () => {
    const blob = parseDivinerTextBlob('no markers');
    expect(blobToQueuedGuess(blob, 1, 0)).toBeNull();
  });
});
