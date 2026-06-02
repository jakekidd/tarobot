// Diviner text-blob parser tests.
//
// The diviner writes a free-form thinking pass followed by one or more
// ===GUESS=== blocks, each with hypothesis / guess / predict fields.
// LOCATE turns emit a batch (3, then 2); COMPOSE emits one. These tests
// pin the parser's tolerance and the batch -> QueuedGuess[] mapping.

import { describe, expect, it } from 'vitest';
import { parseDivinerTextBlob } from '../../src/pipeline/antechamber/agents/diviner/parseTextBlob';
import { blobToQueuedGuesses } from '../../src/pipeline/antechamber/agents/diviner';

const BATCH = `
I don't yet know where the charge is, so I'm spreading wide: one at
health, one at work, one at the friendships. Different domains so a COLD
on any tells me where the live thing isn't.

===GUESS===
hypothesis: am i carrying my health alone?
guess: you're handling something with your health mostly by yourself.
predict: WARM

===GUESS===
hypothesis: should i leave a job that's fine?
guess: the job is fine on paper and that's exactly the problem.
predict: COLD

===GUESS===
hypothesis: am i the one who always reaches out first?
guess: you keep the friendships alive single-handed, and you're tired of it.
predict: HOT
`;

describe('parseDivinerTextBlob — batched LOCATE output', () => {
  it('extracts thinking + all three guesses with fields', () => {
    const blob = parseDivinerTextBlob(BATCH);
    expect(blob.thinking.length).toBeGreaterThan(50);
    expect(blob.guesses).toHaveLength(3);
    expect(blob.guesses[0]!.hypothesis).toBe('am i carrying my health alone?');
    expect(blob.guesses[0]!.guess).toContain('your health mostly by yourself');
    expect(blob.guesses[0]!.predicted_response).toBe('warm');
    expect(blob.guesses[1]!.predicted_response).toBe('cold');
    expect(blob.guesses[2]!.predicted_response).toBe('hot');
  });

  it('thinking is everything before the first guess block', () => {
    const blob = parseDivinerTextBlob(BATCH);
    expect(blob.thinking).toContain('spreading wide');
    expect(blob.thinking).not.toContain('===GUESS===');
  });
});

describe('parseDivinerTextBlob — single guess (COMPOSE)', () => {
  it('parses one block and preserves periods in the guess', () => {
    const raw = `thinking here
===GUESS===
hypothesis: am i keeping a foot on the brake on purpose?
guess: you keep almost-deciding. and not.
predict: WARM`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guesses).toHaveLength(1);
    expect(blob.guesses[0]!.guess).toBe('you keep almost-deciding. and not.');
  });

  it('joins multi-line guess content into one line', () => {
    const raw = `===GUESS===
hypothesis: am i drifting on purpose?
guess: you have spent
    the last six months
    not quite choosing
predict: WARM`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guesses[0]!.guess).toBe('you have spent the last six months not quite choosing');
  });

  it('predict is optional', () => {
    const raw = `===GUESS===
hypothesis: am i mid-step?
guess: you are mid-step.`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guesses[0]!.guess).toBe('you are mid-step.');
    expect(blob.guesses[0]!.predicted_response).toBeUndefined();
  });
});

describe('parseDivinerTextBlob — malformed input (graceful degradation)', () => {
  it('returns no guesses when no markers are present', () => {
    const blob = parseDivinerTextBlob('just thinking, no markers anywhere');
    expect(blob.thinking).toBe('just thinking, no markers anywhere');
    expect(blob.guesses).toHaveLength(0);
  });

  it('skips a block missing its guess field', () => {
    const raw = `===GUESS===
hypothesis: a question?
predict: WARM
===GUESS===
hypothesis: another?
guess: this one lands.
predict: COLD`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guesses).toHaveLength(1);
    expect(blob.guesses[0]!.guess).toBe('this one lands.');
  });

  it('marker matching is case-sensitive (lowercase ===guess=== does not split)', () => {
    const raw = `===guess===
hypothesis: one
guess: a.`;
    const blob = parseDivinerTextBlob(raw);
    expect(blob.guesses).toHaveLength(0);
  });
});

describe('blobToQueuedGuesses', () => {
  it('maps a batch to QueuedGuesses with incrementing idx', () => {
    const blob = parseDivinerTextBlob(BATCH);
    const qs = blobToQueuedGuesses(blob, 5, 12);
    expect(qs).toHaveLength(3);
    expect(qs[0]!.idx).toBe(5);
    expect(qs[1]!.idx).toBe(6);
    expect(qs[2]!.idx).toBe(7);
    expect(qs[0]!.hypothesis).toBe('am i carrying my health alone?');
    expect(qs[0]!.predicted_response).toBe('warm');
    expect(qs[0]!.emitted_at_turn).toBe(12);
  });

  it('returns an empty array when the blob has no guesses', () => {
    const blob = parseDivinerTextBlob('no markers');
    expect(blobToQueuedGuesses(blob, 1, 0)).toHaveLength(0);
  });
});
