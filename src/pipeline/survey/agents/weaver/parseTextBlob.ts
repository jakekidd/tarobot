// WEAVER text-blob parser.
//
// WEAVER emits free-form thinking followed by two labeled sections:
//
//   <thinking paragraphs>
//
//   ===CANDIDATES===
//       label-one: short description
//           thought (entry 3)
//           thought (assertion 2 WARM)
//       label-two: short description
//           thought (assertion 4 COLD)
//
//   ===TERMINATE===
//       yes | no
//
// Parser is forgiving:
//   - missing sections return empty / false
//   - first occurrence of each marker wins
//   - a candidate "header" line is `label-slug: description...` where
//     `label-slug` matches /^[a-z][a-z0-9-]*$/ (kebab-case). Anything
//     else within ===CANDIDATES=== is treated as a thought attached
//     to the most recent header. Thoughts before any header are
//     dropped (malformed).

import type { PotentialDilemma } from '../../types';

const MARKER_CANDIDATES = '===CANDIDATES===';
const MARKER_TERMINATE = '===TERMINATE===';

const LABEL_LINE_RE = /^([a-z][a-z0-9-]*)\s*:\s*(.*)$/;

export type WeaverTextBlob = {
  thinking: string;
  candidates: PotentialDilemma[];
  terminate: boolean;
};

export function parseWeaverTextBlob(raw: string): WeaverTextBlob {
  const c_idx = raw.indexOf(MARKER_CANDIDATES);
  const t_idx = raw.indexOf(MARKER_TERMINATE);

  const thinking = (c_idx >= 0 ? raw.slice(0, c_idx) : raw).trim();

  const c_start = c_idx >= 0 ? c_idx + MARKER_CANDIDATES.length : -1;
  const c_end = t_idx > c_idx ? t_idx : raw.length;
  const c_block = c_idx >= 0 ? raw.slice(c_start, c_end) : '';
  const candidates = parseCandidates(c_block);

  const t_block = t_idx >= 0 ? raw.slice(t_idx + MARKER_TERMINATE.length).trim() : '';
  const terminate = /\byes\b/i.test(t_block);

  return { thinking, candidates, terminate };
}

function parseCandidates(block: string): PotentialDilemma[] {
  const out: PotentialDilemma[] = [];
  let current: PotentialDilemma | null = null;
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const match = LABEL_LINE_RE.exec(line);
    if (match) {
      current = {
        label: match[1]!,
        description: match[2]!.trim(),
        thoughts: [],
      };
      out.push(current);
      continue;
    }
    if (!current) continue;
    const cleaned = line.replace(/^[-*•·]\s+/, '').trim();
    if (cleaned.length === 0) continue;
    current.thoughts.push(cleaned);
  }
  return out;
}
