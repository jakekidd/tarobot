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
//   ===ENGAGEMENT===
//       live | wind_down | flat
//
// Parser is forgiving:
//   - missing sections default to empty / 'live'
//   - first occurrence of each marker wins
//   - a candidate "header" line is `label-slug: description...` where
//     `label-slug` matches /^[a-z][a-z0-9-]*$/ (kebab-case). Anything
//     else within ===CANDIDATES=== is treated as a thought attached
//     to the most recent header. Thoughts before any header are
//     dropped (malformed).
//
// Back-compat: the pre-Mr-Brainstorm prompt used ===TERMINATE=== with
// yes/no. If the model emits the old form, we still parse it
// (yes → 'flat', no → 'live'). This lets older prompts not break
// during the transition.

import type { PotentialDilemma } from '../../types';

const MARKER_CANDIDATES = '===CANDIDATES===';
const MARKER_ENGAGEMENT = '===ENGAGEMENT===';
const MARKER_TERMINATE_LEGACY = '===TERMINATE===';

const LABEL_LINE_RE = /^([a-z][a-z0-9-]*)\s*:\s*(.*)$/;

export type Engagement = 'live' | 'wind_down' | 'flat';

export type WeaverTextBlob = {
  thinking: string;
  candidates: PotentialDilemma[];
  engagement: Engagement;
};

export function parseWeaverTextBlob(raw: string): WeaverTextBlob {
  const c_idx = raw.indexOf(MARKER_CANDIDATES);
  const e_idx = raw.indexOf(MARKER_ENGAGEMENT);
  const tlegacy_idx = raw.indexOf(MARKER_TERMINATE_LEGACY);
  // Whichever trailing marker is present (prefer ENGAGEMENT, fall
  // back to legacy TERMINATE) bounds the CANDIDATES block.
  const tail_idx = e_idx >= 0 ? e_idx : tlegacy_idx;

  const thinking = (c_idx >= 0 ? raw.slice(0, c_idx) : raw).trim();

  const c_start = c_idx >= 0 ? c_idx + MARKER_CANDIDATES.length : -1;
  const c_end = tail_idx > c_idx ? tail_idx : raw.length;
  const c_block = c_idx >= 0 ? raw.slice(c_start, c_end) : '';
  const candidates = parseCandidates(c_block);

  const engagement = parseEngagement(raw, e_idx, tlegacy_idx);

  return { thinking, candidates, engagement };
}

function parseEngagement(raw: string, e_idx: number, tlegacy_idx: number): Engagement {
  if (e_idx >= 0) {
    const block = raw.slice(e_idx + MARKER_ENGAGEMENT.length).trim().toLowerCase();
    if (/\bflat\b/.test(block)) return 'flat';
    if (/\bwind[\s_-]?down\b/.test(block)) return 'wind_down';
    if (/\blive\b/.test(block)) return 'live';
    return 'live'; // malformed → safest default
  }
  // Legacy ===TERMINATE=== yes|no — preserve back-compat. yes → flat.
  if (tlegacy_idx >= 0) {
    const block = raw.slice(tlegacy_idx + MARKER_TERMINATE_LEGACY.length).trim();
    return /\byes\b/i.test(block) ? 'flat' : 'live';
  }
  return 'live';
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
