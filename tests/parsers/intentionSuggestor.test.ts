// Intention-suggestor cleanup tests. The cleanup function strips
// the most common model wrappers (leading bullets / quotes /
// preamble) and returns the first usable sentence — single source
// of tolerance for model variability.

import { describe, expect, it } from 'vitest';
import { cleanupSuggestion } from '../../src/pipeline/antechamber/intention-suggestor';

describe('cleanupSuggestion', () => {
  it('returns a clean sentence as-is', () => {
    const out = cleanupSuggestion('should i leave the job even though theo wants me to do it');
    expect(out).toBe('should i leave the job even though theo wants me to do it');
  });

  it('lowercases (defensive — prompt asks for lowercase)', () => {
    expect(cleanupSuggestion('Should I Leave?')).toBe('should i leave?');
  });

  it('strips leading bullet markers', () => {
    expect(cleanupSuggestion('- should i leave')).toBe('should i leave');
    expect(cleanupSuggestion('* should i leave')).toBe('should i leave');
    expect(cleanupSuggestion('• should i leave')).toBe('should i leave');
    expect(cleanupSuggestion('· should i leave')).toBe('should i leave');
  });

  it('strips paired quotes', () => {
    expect(cleanupSuggestion('"should i leave"')).toBe('should i leave');
    expect(cleanupSuggestion("'should i leave'")).toBe('should i leave');
    expect(cleanupSuggestion('`should i leave`')).toBe('should i leave');
  });

  it('returns first non-empty line and drops the rest', () => {
    const raw = `

should i leave the job?

(alt: should i quit?)
`;
    expect(cleanupSuggestion(raw)).toBe('should i leave the job?');
  });

  it('returns empty string when input is empty / pure whitespace', () => {
    expect(cleanupSuggestion('')).toBe('');
    expect(cleanupSuggestion('\n\n  \n')).toBe('');
  });

  // KNOWN GAPS — documenting what cleanup does NOT do, in case future
  // model behaviour exposes these.

  it('does NOT strip preamble like "here is a question:" (cleanup is line-level only)', () => {
    expect(cleanupSuggestion('Here is a question: should i leave?')).toBe(
      'here is a question: should i leave?',
    );
  });

  it('does NOT strip markdown headers', () => {
    expect(cleanupSuggestion('# should i leave?')).toBe('# should i leave?');
  });
});
