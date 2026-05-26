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
//   ===IF_WARMER===
//       short mascot comment if the user picks WARMER
//
//   ===IF_COLDER===
//       short mascot comment if the user picks COLDER
//
// Parser is forgiving: missing sections return empty; first occurrence
// of each marker wins; section content is trimmed and the inside-
// section convention (period truncates each line) is applied to the
// short single-line sections (assertion, if_warmer, if_colder).
// Hypotheses are kept as a list of trimmed strings.

export type DetectiveTextBlob = {
  thinking: string;
  hypotheses: string[];
  assertion: string;
  if_warmer: string;
  if_colder: string;
};

const MARKER_HYPOTHESES = '===HYPOTHESES===';
const MARKER_ASSERTION = '===ASSERTION===';
const MARKER_IF_WARMER = '===IF_WARMER===';
const MARKER_IF_COLDER = '===IF_COLDER===';

export function parseDetectiveTextBlob(raw: string): DetectiveTextBlob {
  const h_idx = raw.indexOf(MARKER_HYPOTHESES);
  const a_idx = raw.indexOf(MARKER_ASSERTION);
  const w_idx = raw.indexOf(MARKER_IF_WARMER);
  const c_idx = raw.indexOf(MARKER_IF_COLDER);

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

  // Single-line sections — assertion / if_warmer / if_colder.
  const assertion = extractSingleLine(raw, a_idx, MARKER_ASSERTION, [w_idx, c_idx, raw.length]);
  const if_warmer = extractSingleLine(raw, w_idx, MARKER_IF_WARMER, [c_idx, raw.length]);
  const if_colder = extractSingleLine(raw, c_idx, MARKER_IF_COLDER, [raw.length]);

  return { thinking, hypotheses, assertion, if_warmer, if_colder };
}

/** Pull the content of a single-line section. Trims, joins indented
 *  lines, takes the first non-empty line, truncates at the first
 *  period. */
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
  // First non-empty line is the content.
  const firstLine = block.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return truncateAtPeriod(firstLine);
}

/** Take everything before the first period. The detective's protocol
 *  says periods terminate a section line. */
function truncateAtPeriod(s: string): string {
  const idx = s.indexOf('.');
  if (idx < 0) return s;
  return s.slice(0, idx).trim();
}
