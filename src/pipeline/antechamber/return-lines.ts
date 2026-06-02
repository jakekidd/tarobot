// Mascot lines delivered when a returning user confirms RESUME.
//
// Canned, lowercase, in the cat's voice. Kept short — the dialogue line
// component types them out, so length is felt. Pick one at random; UI
// supplies the name (or undefined for anonymous warmth).
//
// Content lives in materials/mascot/return-lines.md and is parsed at
// boot. Add / remove lines there without touching this file. The loader
// reads two sections (`## with name` and `## anonymous`) and treats
// `{name}` as the substitution placeholder.

import RETURN_LINES_MD from '../../../materials/mascot/return-lines.md?raw';

type ParsedLines = { withName: string[]; anonymous: string[] };

function parseReturnLines(md: string): ParsedLines {
  const sections: Record<string, string[]> = { 'with name': [], 'anonymous': [] };
  let current: string | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const key = h2[1]!.toLowerCase();
      current = key in sections ? key : null;
      continue;
    }
    if (line.startsWith('#') || line.startsWith('<!--')) continue;  // top header / comments
    if (!current) continue;
    sections[current]!.push(line);
  }
  return { withName: sections['with name']!, anonymous: sections['anonymous']! };
}

const { withName: TEMPLATES_WITH_NAME, anonymous: TEMPLATES_ANON } = parseReturnLines(RETURN_LINES_MD);

export const RETURN_LINES = { TEMPLATES_WITH_NAME, TEMPLATES_ANON } as const;

/** Pick a random return line. Pass the user's name to allow name-aware
 *  variants; pass undefined for anonymous lines (rarely needed since we
 *  always have at least Q1 name by the time this fires). */
export function pickReturnLine(name?: string): string {
  if (name && name.trim().length > 0) {
    const cleaned = name.trim().toLowerCase();
    const template = TEMPLATES_WITH_NAME[Math.floor(Math.random() * TEMPLATES_WITH_NAME.length)]!;
    return template.replace(/\{name\}/g, cleaned);
  }
  return TEMPLATES_ANON[Math.floor(Math.random() * TEMPLATES_ANON.length)]!;
}
