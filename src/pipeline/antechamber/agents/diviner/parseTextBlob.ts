// Diviner text-blob parser.
//
// The diviner writes a free-form thinking pass followed by two
// labeled sections:
//
//   <thinking paragraphs — investigating, weighing, planning>
//
//   ===HYPOTHESIS===
//       one line; candidate dilemma in the user's voice as a question
//
//   ===GUESS===
//       one line; the single guess to voice this turn
//
// Parser is forgiving: missing sections return empty; first occurrence
// of each marker wins.

export type DivinerTextBlob = {
  thinking: string;
  hypothesis: string;
  guess: string;
};

const MARKER_HYPOTHESIS = '===HYPOTHESIS===';
const MARKER_GUESS = '===GUESS===';

export function parseDivinerTextBlob(raw: string): DivinerTextBlob {
  const h_idx = raw.indexOf(MARKER_HYPOTHESIS);
  const g_idx = raw.indexOf(MARKER_GUESS);

  // Thinking is everything before the first labeled section.
  const first_section = [h_idx, g_idx].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
  const thinking = (first_section >= 0 ? raw.slice(0, first_section) : raw).trim();

  const hypothesis = extractSingleLine(raw, h_idx, MARKER_HYPOTHESIS, [g_idx, raw.length]);
  const guess = extractSingleLine(raw, g_idx, MARKER_GUESS, [h_idx, raw.length]);

  return { thinking, hypothesis, guess };
}

/** Pull the content of a single-line section. Joins indented lines
 *  into one trimmed line. NO period-truncation — guess and hypothesis
 *  are user-shaped and may use punctuation for rhythm. */
function extractSingleLine(
  raw: string,
  marker_idx: number,
  marker: string,
  candidate_ends: number[],
): string {
  if (marker_idx < 0) return '';
  const start = marker_idx + marker.length;
  const ends = candidate_ends.filter((e) => e > marker_idx);
  const end = ends.length > 0 ? Math.min(...ends) : raw.length;
  const block = raw.slice(start, end).trim();
  if (!block) return '';
  return block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).join(' ');
}
