// Word-boundary highlighter for the seer's dialogue. Wraps any mention
// of the user's name or a drawn card's name in a colored <span>. Used by
// both the live dialogue ChunkedLine and the Transcript message text.
//
// Card names render in brand violet; user name in brand violet too (same
// emphasis color — different from speaker labels which are violet on
// "you" and turquoise on "seer"). Keeping a single accent for in-text
// emphasis avoids visual noise.

import type { ReactNode } from 'react';

export type Highlights = {
  userName: string | null;
  cardNames: string[];
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Tokenize text into ReactNodes, wrapping name matches in purple spans. */
export function highlightNames(text: string, h: Highlights): ReactNode[] {
  if (!text) return [text];
  const tokens: { src: string; cls: string }[] = [];
  if (h.userName) tokens.push({ src: escapeRegex(h.userName), cls: 'hl-name' });
  for (const c of h.cardNames) {
    if (c) tokens.push({ src: escapeRegex(c), cls: 'hl-card' });
  }
  if (tokens.length === 0) return [text];
  // One pass: alternation with named groups isn't portable in older
  // browsers, so we match all and classify by lowercased comparison.
  const pattern = new RegExp(`\\b(${tokens.map((t) => t.src).join('|')})\\b`, 'gi');
  const out: ReactNode[] = [];
  let last = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  const lowerUser = h.userName?.toLowerCase() ?? null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const matched = m[0];
    const isUser = lowerUser !== null && matched.toLowerCase() === lowerUser;
    out.push(
      <span key={`hl-${idx++}`} className={isUser ? 'hl hl-name' : 'hl hl-card'}>
        {isUser ? matched.toUpperCase() : matched}
      </span>,
    );
    last = m.index + matched.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
