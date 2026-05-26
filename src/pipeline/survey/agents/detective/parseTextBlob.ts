// Detective text-blob parser.
//
// The detective writes a structured but free-form text output:
//
//   <thinking paragraphs — investigating, weighing, planning>
//
//   ===HYPOTHESES===
//       hypothesis statement one
//       hypothesis statement two
//       ...
//
//   ===ASSERTION===
//       the single assertion to voice this turn
//
//   ===IF_WARM===
//       short mascot comment if the user picks WARMER
//
//   ===IF_COLD===
//       short mascot comment if the user picks COLDER
//
// Parser is forgiving: missing sections return empty; first occurrence
// of each marker wins.
//
// Period semantics: HYPOTHESES lines truncate at the first period
// (they're fragments by design). ASSERTION / IF_WARM / IF_COLD do
// NOT truncate — the assertion is the user-facing line and a good
// pointed assertion sometimes needs the rhythm a period gives
// ("you keep almost-deciding. and not."). Same for the mascot
// stall comments.

export type DetectiveTextBlob = {
  thinking: string;
  hypotheses: string[];
  assertion: string;
  if_warm: string;
  if_cold: string;
};

const MARKER_HYPOTHESES = '===HYPOTHESES===';
const MARKER_ASSERTION = '===ASSERTION===';
const MARKER_IF_WARM = '===IF_WARM===';
const MARKER_IF_COLD = '===IF_COLD===';

export function parseDetectiveTextBlob(raw: string): DetectiveTextBlob {
  const h_idx = raw.indexOf(MARKER_HYPOTHESES);
  const a_idx = raw.indexOf(MARKER_ASSERTION);
  const w_idx = raw.indexOf(MARKER_IF_WARM);
  const c_idx = raw.indexOf(MARKER_IF_COLD);

  // Thinking is everything before HYPOTHESES (or the whole blob if
  // the marker is missing — that's a malformed output but we keep
  // what the detective wrote).
  const thinking = (h_idx >= 0 ? raw.slice(0, h_idx) : raw).trim();

  // Hypothesis block: between HYPOTHESES and ASSERTION (or end).
  const h_start = h_idx >= 0 ? h_idx + MARKER_HYPOTHESES.length : -1;
  const h_end = a_idx > h_idx ? a_idx : raw.length;
  const hyp_block = h_idx >= 0 ? raw.slice(h_start, h_end) : '';
  const hypotheses = hyp_block
    .split('\n')
    .map((line) => truncateAtPeriod(line.trim()))
    .filter((line) => line.length > 0);

  // Single-line sections — assertion / if_warm / if_cold.
  const assertion = extractSingleLine(raw, a_idx, MARKER_ASSERTION, [w_idx, c_idx, raw.length]);
  const if_warm = extractSingleLine(raw, w_idx, MARKER_IF_WARM, [c_idx, raw.length]);
  const if_cold = extractSingleLine(raw, c_idx, MARKER_IF_COLD, [raw.length]);

  return { thinking, hypotheses, assertion, if_warm, if_cold };
}

/** Pull the content of a single-line section. Joins indented lines
 *  into one trimmed line. NO period-truncation — the assertion / mascot
 *  comments are user-facing and may use punctuation for rhythm. */
function extractSingleLine(
  raw: string,
  marker_idx: number,
  marker: string,
  candidate_ends: number[],
): string {
  if (marker_idx < 0) return '';
  const start = marker_idx + marker.length;
  const end = Math.min(...candidate_ends.filter((e) => e > marker_idx));
  const block = raw.slice(start, end).trim();
  if (!block) return '';
  // Collapse multi-line indented content into one space-joined string,
  // since model may wrap an assertion across lines.
  return block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).join(' ');
}

/** Take everything before the first period. The detective's protocol
 *  says periods terminate a section line. */
function truncateAtPeriod(s: string): string {
  const idx = s.indexOf('.');
  if (idx < 0) return s;
  return s.slice(0, idx).trim();
}
