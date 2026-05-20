// Template loader tests. The HTML-comment stripping is what the
// seer relies on to consume profile.body without instruction-comment
// leaks.

import { describe, expect, it } from 'vitest';
import {
  PROFILE_TEMPLATE_RAW,
  PROFILE_TEMPLATE_STRIPPED,
  stripHtmlComments,
} from '../src/pipeline/survey/template';

describe('stripHtmlComments', () => {
  it('removes a single-line HTML comment', () => {
    expect(stripHtmlComments('hello <!-- world --> there')).toBe('hello  there');
  });

  it('removes multi-line HTML comments', () => {
    const input = 'before\n<!--\n  multi\n  line\n-->\nafter';
    expect(stripHtmlComments(input)).toBe('before\n\nafter');
  });

  it('removes multiple comments', () => {
    expect(stripHtmlComments('a <!-- one --> b <!-- two --> c')).toBe('a  b  c');
  });

  it('collapses 3+ consecutive newlines to 2', () => {
    expect(stripHtmlComments('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripHtmlComments('  \n\nhello\n\n  ')).toBe('hello');
  });

  it('handles input with no comments unchanged (modulo trim)', () => {
    expect(stripHtmlComments('# header\n\nbody.')).toBe('# header\n\nbody.');
  });
});

describe('PROFILE_TEMPLATE_RAW', () => {
  it('contains the 9 expected section headers', () => {
    const headers = ['self', 'history', 'relationships', 'joys', 'fears', 'insecurities', 'yearnings', 'now', 'tensions'];
    for (const h of headers) {
      expect(PROFILE_TEMPLATE_RAW).toMatch(new RegExp(`^## ${h}\\b`, 'm'));
    }
  });

  it('contains HTML-comment instructions', () => {
    expect(PROFILE_TEMPLATE_RAW).toMatch(/<!--/);
    expect(PROFILE_TEMPLATE_RAW).toMatch(/-->/);
  });
});

describe('PROFILE_TEMPLATE_STRIPPED', () => {
  it('has no remaining HTML comments', () => {
    expect(PROFILE_TEMPLATE_STRIPPED).not.toMatch(/<!--/);
    expect(PROFILE_TEMPLATE_STRIPPED).not.toMatch(/-->/);
  });

  it('preserves the 9 section headers after stripping', () => {
    const headers = ['self', 'history', 'relationships', 'joys', 'fears', 'insecurities', 'yearnings', 'now', 'tensions'];
    for (const h of headers) {
      expect(PROFILE_TEMPLATE_STRIPPED).toMatch(new RegExp(`^## ${h}\\b`, 'm'));
    }
  });
});
