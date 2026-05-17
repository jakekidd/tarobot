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

    // The matched span (without the underscores). Persona occasionally
    // writes "_ answered_" with leading/trailing whitespace inside the
    // markers; those spaces should render as plain text (they're not part
    // of the emphasized word). Otherwise the underline visually starts
    // under the space, skipping the first letter.
    const phrase = m[1] ?? '';
    const lead = phrase.length - phrase.trimStart().length;
    const trail = phrase.length - phrase.trimEnd().length;
    const start = cursor + lead;
    out.push(phrase);
    cursor += phrase.length;
    ranges.push({ start, end: cursor - trail });

    lastIdx = m.index + m[0].length;
  }

  // Tail
  if (lastIdx < raw.length) {
    out.push(raw.slice(lastIdx));
  }

  return { text: out.join(''), ranges };
}
