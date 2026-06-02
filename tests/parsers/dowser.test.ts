// Dowser text-blob parser fuzz tests.
//
// Each agent prompt explicitly instructs the model on output shape;
// these tests pin the parser's tolerance to the documented contract
// AND probe failure modes where the model could plausibly drift
// (e.g., adding bullets to hypothesis lines, lowercasing markers,
// emitting all four sections but with an extra wrapper).

import { describe, expect, it } from 'vitest';
import { parseDowserTextBlob } from '../../src/pipeline/antechamber/agents/dowser/parseTextBlob';
import { blobToQueuedGuess } from '../../src/pipeline/antechamber/agents/dowser';

const WELL_FORMED = `
I've been thinking about the warmth pattern. Maren's correction on
A1 was specific — "less the job, more what staying says about me."
That's a self-identity hit, not a vocational one. Hypothesis 1 is
the strongest live thread.

The next guess should test whether the identity-thread is
specifically vs. theo. He wants her to do it, per her correction
on A3. So the friction lives elsewhere.

===HYPOTHESES===
    she's choosing security over freedom even though she picked freedom on pillar 5
    staying in the job is doing identity work she doesn't want to admit
    theo is supportive — the resistance is internal

===GUESS===
    the part of you that won't quit isn't afraid of theo's reaction. it's afraid of who you become if you do.

===IF_WARM===
    there it is.

===IF_COLD===
    let me try a different angle.
`;

describe('parseDowserTextBlob — well-formed input', () => {
  it('extracts all sections (preserves periods in single-line sections)', () => {
    const blob = parseDowserTextBlob(WELL_FORMED);
    expect(blob.thinking.length).toBeGreaterThan(50);
    expect(blob.hypotheses).toHaveLength(3);
    expect(blob.guess).toContain('afraid of who you become');
    // guess / if_warm / if_cold / if_hot do NOT truncate at periods —
    // rhythm matters and these are user-facing. Only HYPOTHESES truncates.
    expect(blob.if_warm).toBe('there it is.');
    expect(blob.if_cold).toBe('let me try a different angle.');
    // IF_HOT absent in this fixture — returns empty string by design.
    expect(blob.if_hot).toBe('');
  });

  it('extracts IF_HOT when present (regardless of section order)', () => {
    const raw = `===HYPOTHESES===
    one
===GUESS===
    you've been almost-deciding.
===IF_COLD===
    let me try elsewhere.
===IF_WARM===
    close.
===IF_HOT===
    there it is — that's the one.`;
    const blob = parseDowserTextBlob(raw);
    expect(blob.if_cold).toBe('let me try elsewhere.');
    expect(blob.if_warm).toBe('close.');
    expect(blob.if_hot).toBe("there it is — that's the one.");
  });

  it('truncates hypotheses at the first period (fragments contract)', () => {
    const raw = `===HYPOTHESES===
    she stays for security. that's the story.
    he wants her to leave.
===GUESS===
    you keep almost-deciding.
===IF_WARM===
    yes.
===IF_COLD===
    no.`;
    const blob = parseDowserTextBlob(raw);
    expect(blob.hypotheses).toEqual(['she stays for security', 'he wants her to leave']);
  });

  it('preserves periods in the guess (rhythm matters)', () => {
    const raw = `===HYPOTHESES===
    one
===GUESS===
    you keep almost-deciding. and not.
===IF_WARM===
    yes.
===IF_COLD===
    no.`;
    const blob = parseDowserTextBlob(raw);
    expect(blob.guess).toBe('you keep almost-deciding. and not.');
  });

  it('joins multi-line guess content into one line', () => {
    const raw = `===HYPOTHESES===
    one
===GUESS===
    you have spent
    the last six months
    not quite choosing
===IF_WARM===
    yes
===IF_COLD===
    no`;
    const blob = parseDowserTextBlob(raw);
    expect(blob.guess).toBe('you have spent the last six months not quite choosing');
  });
});

describe('parseDowserTextBlob — malformed input (graceful degradation)', () => {
  it('returns empty fields when no markers are present', () => {
    const blob = parseDowserTextBlob('just thinking, no markers anywhere');
    expect(blob.thinking).toBe('just thinking, no markers anywhere');
    expect(blob.hypotheses).toEqual([]);
    expect(blob.guess).toBe('');
    expect(blob.if_warm).toBe('');
    expect(blob.if_cold).toBe('');
  });

  it('returns empty for sections that appear without content', () => {
    const raw = `===HYPOTHESES===
===GUESS===
    fine.
===IF_WARM===
===IF_COLD===
`;
    const blob = parseDowserTextBlob(raw);
    expect(blob.hypotheses).toEqual([]);
    expect(blob.guess).toBe('fine.');
    expect(blob.if_warm).toBe('');
    expect(blob.if_cold).toBe('');
  });

  // The parser uses indexOf for marker offsets and grabs everything
  // between the first HYPOTHESES and the first GUESS. If the model
  // emits HYPOTHESES twice (sloppy output), the duplicate marker text
  // ends up INSIDE the hypothesis list as a regular line. Documenting
  // current behaviour so future tightening is intentional.
  it('does NOT dedupe a repeated section marker (becomes pollution)', () => {
    const raw = `===HYPOTHESES===
    first list
===HYPOTHESES===
    second list
===GUESS===
    pick one.
===IF_WARM===
    .
===IF_COLD===
    .`;
    const blob = parseDowserTextBlob(raw);
    // The marker text itself + "second list" both flow into hypotheses
    // since they're between idx-of-first-HYPOTHESES and idx-of-GUESS.
    expect(blob.hypotheses).toEqual(['first list', '===HYPOTHESES===', 'second list']);
  });
});

describe('parseDowserTextBlob — KNOWN PARSER GAPS (documents current behavior)', () => {
  // The model may add bulleted prefixes (- or *) to hypothesis lines
  // despite prompt instructions. The current parser does NOT strip
  // them. If the model drifts, hypotheses come out with the bullet
  // visibly present. NOT a bug if the prompt enforces — but worth a
  // pinned test so we notice when it starts mattering.
  it('does NOT strip "-" bullet prefixes from hypotheses (parser is strict)', () => {
    const raw = `===HYPOTHESES===
    - she stays for security
    - he wants her to leave
===GUESS===
    a.
===IF_WARM===
    .
===IF_COLD===
    .`;
    const blob = parseDowserTextBlob(raw);
    // Bullets are preserved verbatim — period truncation kept the text
    // intact since there are no periods inside the bulleted text.
    expect(blob.hypotheses[0]).toBe('- she stays for security');
  });

  // Markers are case-sensitive. ===hypotheses=== would not match.
  it('marker matching is case-sensitive', () => {
    const raw = `===hypotheses===
    one
===GUESS===
    a.`;
    const blob = parseDowserTextBlob(raw);
    expect(blob.hypotheses).toEqual([]);
  });
});

describe('blobToQueuedGuess', () => {
  it('returns a QueuedGuess when the blob has an guess', () => {
    const blob = parseDowserTextBlob(WELL_FORMED);
    const q = blobToQueuedGuess(blob, 5, 12);
    expect(q).not.toBeNull();
    expect(q?.idx).toBe(5);
    expect(q?.statement).toContain('afraid of who you become');
    expect(q?.comment_if_warm).toBe('there it is.');
    expect(q?.comment_if_cold).toBe('let me try a different angle.');
    expect(q?.emitted_at_turn).toBe(12);
  });

  it('returns null when the blob has no guess', () => {
    const blob = parseDowserTextBlob('no markers');
    expect(blobToQueuedGuess(blob, 1, 0)).toBeNull();
  });
});
