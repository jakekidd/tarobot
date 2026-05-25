// Subject Anchor — parser + diff helpers for the markdown anchor doc
// the profiler writes.
//
// The canonical anchor in EngineState is a raw markdown string. These
// helpers exist for two consumers:
//   - the debug panel (AnchorView): renders per-section update markers
//     and a brief diff flash when content changes
//   - the engine itself: detects which sections changed across profiler
//     passes so it can publish per-section turn markers for the panel
//
// No mutation here. Pure functions over markdown strings.

import { ANCHOR_SECTIONS } from './anchor-template';

/** A parsed anchor section. `content` is everything after the
 *  `## <heading>` line up to the next `## ` or end-of-doc, trimmed. */
export type ParsedSection = {
  heading: string;
  content: string;
};

/** Split a markdown anchor into its `## ` sections. Lines before the
 *  first `## ` (the `# Subject Anchor — name` title) are dropped.
 *  Section headers not in the active section set ARE preserved — the
 *  parser does not validate; that's the caller's job if needed. */
export function parseAnchorSections(md: string): ParsedSection[] {
  if (!md.trim()) return [];
  const lines = md.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current) sections.push({ heading: current.heading, content: current.content.trim() });
      current = { heading: match[1]!, content: '' };
      continue;
    }
    if (current) current.content += line + '\n';
  }
  if (current) sections.push({ heading: current.heading, content: current.content.trim() });
  return sections;
}

/** Per-section diff between two anchor snapshots. `changed` lists
 *  headings whose content differs; `added` lists headings present in
 *  next but not prev; `removed` lists headings present in prev but
 *  not next. Used by the debug panel for update markers + diff flash. */
export type AnchorDiff = {
  changed: string[];
  added: string[];
  removed: string[];
};

export function diffAnchors(prev: string, next: string): AnchorDiff {
  const prevSections = new Map(parseAnchorSections(prev).map((s) => [s.heading, s.content]));
  const nextSections = new Map(parseAnchorSections(next).map((s) => [s.heading, s.content]));
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [heading, content] of nextSections) {
    if (!prevSections.has(heading)) {
      added.push(heading);
    } else if (prevSections.get(heading) !== content) {
      changed.push(heading);
    }
  }
  for (const heading of prevSections.keys()) {
    if (!nextSections.has(heading)) removed.push(heading);
  }
  return { changed, added, removed };
}

/** True iff every active section in the template has non-empty content
 *  in the parsed anchor. Used by the close pass to decide whether the
 *  anchor is shippable downstream or still needs work. */
export function isAnchorComplete(md: string): boolean {
  const parsed = new Map(parseAnchorSections(md).map((s) => [s.heading, s.content]));
  return ANCHOR_SECTIONS.every((s) => {
    const content = parsed.get(s.heading);
    return typeof content === 'string' && content.length > 0;
  });
}
