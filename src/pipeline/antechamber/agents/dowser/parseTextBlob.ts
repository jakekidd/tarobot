// Dowser text-blob parser.
//
// The dowser writes a structured but free-form text output:
//
//   <thinking paragraphs — investigating, weighing, planning>
//
//   ===HYPOTHESES===
//       hypothesis statement one
//       hypothesis statement two
//       ...
//
//   ===GUESS===
//       the single guess to voice this turn
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
// (they're fragments by design). GUESS / IF_WARM / IF_COLD do
// NOT truncate — the guess is the user-facing line and a good
// pointed guess sometimes needs the rhythm a period gives
// ("you keep almost-deciding. and not."). Same for the mascot
// stall comments.

export type DowserTextBlob = {
  thinking: string;
  hypotheses: string[];
  guess: string;
  if_cold: string;
  if_warm: string;
  if_hot: string;
};

const MARKER_HYPOTHESES = '===HYPOTHESES===';
const MARKER_GUESS = '===GUESS===';
const MARKER_IF_COLD = '===IF_COLD===';
const MARKER_IF_WARM = '===IF_WARM===';
const MARKER_IF_HOT  = '===IF_HOT===';

export function parseDowserTextBlob(raw: string): DowserTextBlob {
  const h_idx = raw.indexOf(MARKER_HYPOTHESES);
  const a_idx = raw.indexOf(MARKER_GUESS);
  const c_idx = raw.indexOf(MARKER_IF_COLD);
  const w_idx = raw.indexOf(MARKER_IF_WARM);
  const ht_idx = raw.indexOf(MARKER_IF_HOT);

  // Thinking is everything before HYPOTHESES (or the whole blob if
  // the marker is missing — that's a malformed output but we keep
  // what the dowser wrote).
  const thinking = (h_idx >= 0 ? raw.slice(0, h_idx) : raw).trim();

  // Hypothesis block: between HYPOTHESES and GUESS (or end).
  const h_start = h_idx >= 0 ? h_idx + MARKER_HYPOTHESES.length : -1;
  const h_end = a_idx > h_idx ? a_idx : raw.length;
  const hyp_block = h_idx >= 0 ? raw.slice(h_start, h_end) : '';
  const hypotheses = hyp_block
    .split('\n')
    .map((line) => truncateAtPeriod(line.trim()))
    .filter((line) => line.length > 0);

  // Single-line sections. Section bounds are the next-marker offsets
  // among c/w/ht. Sections may appear in any order; missing sections
  // return empty.
  const guess = extractSingleLine(raw, a_idx, MARKER_GUESS, [c_idx, w_idx, ht_idx, raw.length]);
  const if_cold   = extractSingleLine(raw, c_idx, MARKER_IF_COLD,   [w_idx, ht_idx, raw.length]);
  const if_warm   = extractSingleLine(raw, w_idx, MARKER_IF_WARM,   [c_idx, ht_idx, raw.length]);
  const if_hot    = extractSingleLine(raw, ht_idx, MARKER_IF_HOT,   [c_idx, w_idx, raw.length]);

  return { thinking, hypotheses, guess, if_cold, if_warm, if_hot };
}

/** Pull the content of a single-line section. Joins indented lines
 *  into one trimmed line. NO period-truncation — the guess / mascot
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
  // since model may wrap an guess across lines.
  return block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).join(' ');
}

/** Take everything before the first period. The dowser's protocol
 *  says periods terminate a section line. */
function truncateAtPeriod(s: string): string {
  const idx = s.indexOf('.');
  if (idx < 0) return s;
  return s.slice(0, idx).trim();
}
