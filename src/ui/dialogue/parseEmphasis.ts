// Strips persona's _underscore_ emphasis markers from a string and
// returns the cleaned text + the character ranges where the emphasis
// lived. The dialogue renderer animates an underline under each range
// after the typewriter passes through it.
//
// Only single-underscore pairs that don't span newlines and contain
// non-whitespace are honored. Unmatched / malformed underscores are
// left as-is (defensive — we still strip them via sanitize on the way
// in if needed).

export type EmphasisRange = { start: number; end: number };

export type ParsedEmphasis = {
  text: string;
  ranges: EmphasisRange[];
};

const PAIR = /_([^_\n]+?)_/g;

export function parseEmphasis(raw: string): ParsedEmphasis {
  if (!raw || !raw.includes('_')) return { text: raw, ranges: [] };

  const out: string[] = [];
  const ranges: EmphasisRange[] = [];
  let lastIdx = 0;
  let cursor = 0;
  let m: RegExpExecArray | null;
  PAIR.lastIndex = 0;

  while ((m = PAIR.exec(raw)) !== null) {
    // Append unmatched text before this match
    const pre = raw.slice(lastIdx, m.index);
    out.push(pre);
    cursor += pre.length;

    // Strip whitespace from inside the markers — persona occasionally
    // writes "_ word _" with internal padding, which (a) made the
    // underline visually skip leading letters and (b) introduced
    // double-spaces in the rendered text. Trim both the text and the
    // range together so the range covers exactly the visible word(s).
    const phrase = (m[1] ?? '').trim();
    if (phrase.length > 0) {
      const start = cursor;
      out.push(phrase);
      cursor += phrase.length;
      ranges.push({ start, end: cursor });
    }

    lastIdx = m.index + m[0].length;
  }

  // Tail
  if (lastIdx < raw.length) {
    out.push(raw.slice(lastIdx));
  }

  return { text: out.join(''), ranges };
}
