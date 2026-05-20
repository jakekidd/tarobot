// Parser tests. The parser is the boundary between author-edited
// markdown and the engine's typed DialogueTree. Cover the schema
// variations: simple choice / binary / matrix / fork / relationship_pick,
// structured Probe blocks (Surface/Inversions/Watch for), legacy
// single-line Probe fallback, Template skipping, slug collision
// suffixing, and the hardcoded opener injection.

import { describe, expect, it } from 'vitest';
import { parseSurveyMd, slugify } from '../src/pipeline/survey/parseSurveyMd';

describe('parseSurveyMd', () => {
  it('parses a minimal Pillar choice question', () => {
    const md = `# Survey

## Pillars

### How do you make decisions?

Format: choice
Options:
  - mind
  - heart
  - gut
`;
    const tree = parseSurveyMd(md);
    expect(tree.pillars).toHaveLength(1);
    const id = tree.pillars[0]!;
    const node = tree.nodes[id]!;
    expect(node.f).toBe('choice');
    expect(node.q).toBe('how do you make decisions?');
    expect(node.a).toEqual([['mind'], ['heart'], ['gut']]);
  });

  it('parses a Pool question with topic category', () => {
    const md = `## Pool

### relationships

#### With whom have you left the most unsaid?

Format: relationship_pick
`;
    const tree = parseSurveyMd(md);
    // Pool questions are NOT in pillars[]
    expect(tree.pillars).toHaveLength(0);
    const ids = Object.keys(tree.nodes).filter((k) => !['name','birthday','relationship','intent'].includes(k));
    expect(ids).toHaveLength(1);
    const node = tree.nodes[ids[0]!]!;
    expect(node.topic).toBe('relationships');
    expect(node.f).toBe('relationship_pick');
  });

  it('parses structured Probe block (Surface / Inversions / Watch for)', () => {
    const md = `## Pillars

### Which of these do you value most?

Format: choice
Probe:
  Surface: what they will sacrifice OTHERS for.
  Inversions: love → fear of being unlovable; freedom → fear of constraint.
  Watch for: cross-reference later answers.
Options:
  - love
  - freedom
`;
    const tree = parseSurveyMd(md);
    const id = tree.pillars[0]!;
    const probe = tree.nodes[id]!.probe!;
    expect(probe.surface).toMatch(/sacrifice OTHERS for/);
    expect(probe.inversions).toMatch(/love → fear of being unlovable/);
    expect(probe.watch_for).toMatch(/cross-reference/);
  });

  it('falls back to legacy single-line Probe stored as surface', () => {
    const md = `## Pillars

### Have you done this before?

Format: choice
Probe: tarot fluency calibration — does the user already speak the language.
Options:
  - yes
  - no
`;
    const tree = parseSurveyMd(md);
    const id = tree.pillars[0]!;
    const probe = tree.nodes[id]!.probe!;
    expect(probe.surface).toMatch(/tarot fluency calibration/);
    expect(probe.inversions).toBeUndefined();
    expect(probe.watch_for).toBeUndefined();
  });

  it('parses the fork format with left | right pairs', () => {
    const md = `## Pillars

### Which one is your question right now?

Format: fork
Options:
  - risk | hold
  - stay | go
  - silence | speak
`;
    const tree = parseSurveyMd(md);
    const id = tree.pillars[0]!;
    const node = tree.nodes[id]!;
    expect(node.f).toBe('fork');
    expect(node.a).toEqual([
      ['risk | hold'],
      ['stay | go'],
      ['silence | speak'],
    ]);
  });

  it('parses the matrix format with axes', () => {
    const md = `## Pool

### now

#### How are you, actually?

Format: matrix
Axes:
  - x: honest | performing
  - y: okay | not okay
Options:
  - honest + okay
  - honest + not okay
  - performing + okay
  - performing + not okay
`;
    const tree = parseSurveyMd(md);
    const ids = Object.keys(tree.nodes).filter((k) => k.includes('how-are-you'));
    expect(ids).toHaveLength(1);
    const node = tree.nodes[ids[0]!]!;
    expect(node.f).toBe('matrix');
    expect(node.axes).toEqual([['honest', 'performing'], ['okay', 'not okay']]);
  });

  it('skips Template entries (case-insensitive)', () => {
    const md = `## Pillars

### Template

Format: choice
Options:
  - first
  - second

### How do you make decisions?

Format: choice
Options:
  - mind
`;
    const tree = parseSurveyMd(md);
    expect(tree.pillars).toHaveLength(1);  // only the real question, not the Template
    expect(tree.pillars[0]).not.toBe('template');
  });

  it('skips lowercase Template under Pool categories', () => {
    const md = `## Pool

### self

#### Template

Format: choice
Options:
  - x

#### Do you like yourself?

Format: choice
Options:
  - yes
`;
    const tree = parseSurveyMd(md);
    const realIds = Object.keys(tree.nodes).filter((k) => !['name','birthday','relationship','intent'].includes(k));
    expect(realIds).toHaveLength(1);
    expect(realIds[0]).toMatch(/do-you-like-yourself/);
  });

  it('parses inline answer comments via :: syntax', () => {
    const md = `## Pillars

### A question?

Format: choice
Options:
  - first
  - second :: a comment
  - third
`;
    const tree = parseSurveyMd(md);
    const id = tree.pillars[0]!;
    const node = tree.nodes[id]!;
    expect(node.a).toEqual([['first'], ['second', 'a comment'], ['third']]);
  });

  it('throws loud error on unknown Format', () => {
    const md = `## Pillars

### Some question?

Format: gibberish
Options:
  - a
`;
    expect(() => parseSurveyMd(md)).toThrow(/unknown format/);
  });

  it('throws on malformed matrix axes', () => {
    const md = `## Pool

### now

#### Q?

Format: matrix
Axes:
  - x: only-left
Options:
  - a
`;
    expect(() => parseSurveyMd(md)).toThrow(/must be 'left \| right'/);
  });

  it('suffixes slug collisions with -2, -3', () => {
    const md = `## Pool

### self

#### Same heading

Format: choice
Options:
  - a

#### Same heading

Format: choice
Options:
  - b
`;
    const tree = parseSurveyMd(md);
    const ids = Object.keys(tree.nodes).filter((id) => id.startsWith('same-heading'));
    expect(ids.sort()).toEqual(['same-heading', 'same-heading-2']);
  });

  it('always injects the 4 hardcoded openers', () => {
    const tree = parseSurveyMd(`## Pillars\n\n### Q?\nFormat: choice\nOptions:\n  - a\n`);
    expect(tree.openers).toEqual(['name', 'birthday', 'relationship', 'intent']);
    expect(tree.nodes.name!.f).toBe('text');
    expect(tree.nodes.birthday!.f).toBe('date');
    expect(tree.nodes.relationship!.f).toBe('relationship_status');
    expect(tree.nodes.intent!.f).toBe('intent');
  });

  it('exits probe mode on next top-level field', () => {
    // Regression: parser used to swallow Format / Options after Probe block.
    const md = `## Pillars

### Q?

Probe:
  Surface: x.
  Inversions: y.
Format: choice
Options:
  - opt
`;
    const tree = parseSurveyMd(md);
    const id = tree.pillars[0]!;
    const node = tree.nodes[id]!;
    expect(node.f).toBe('choice');
    expect(node.a).toEqual([['opt']]);
    expect(node.probe?.surface).toBe('x.');
  });
});

describe('slugify', () => {
  it('lowercases and converts to dash-separated', () => {
    expect(slugify('How Do You Make Decisions?')).toBe('how-do-you-make-decisions');
  });

  it('drops apostrophes', () => {
    expect(slugify("what's true?")).toBe('whats-true');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('caps at 80 chars', () => {
    const s = slugify('a'.repeat(200));
    expect(s.length).toBeLessThanOrEqual(80);
  });
});
