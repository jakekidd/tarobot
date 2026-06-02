// Diviner text-blob parser.
//
// The diviner writes a free-form thinking pass followed by one or more
// guess blocks. Each block:
//
//   ===GUESS===
//   hypothesis: <candidate dilemma in the subject's voice as a question>
//   guess: <the single line the subject sees>
//   predict: <COLD | WARM | HOT>
//
// LOCATE turns emit a batch (3, then 2); COMPOSE turns emit one. Parser
// is forgiving: a block missing its `guess` field is skipped; `predict`
// is optional; wrapped value lines are joined.

export type DivinerGuess = {
  hypothesis: string;
  guess: string;
  /** The diviner's predicted response (its prior on cold/warm/hot).
   *  Optional; absent when the model omitted it. */
  predicted_response?: 'cold' | 'warm' | 'hot';
};

export type DivinerTextBlob = {
  thinking: string;
  guesses: DivinerGuess[];
};

const MARKER_GUESS = '===GUESS===';
const FIELD_KEYS = /^\s*(hypothesis|guess|predict)\s*:/i;

export function parseDivinerTextBlob(raw: string): DivinerTextBlob {
  const firstMarker = raw.indexOf(MARKER_GUESS);
  const thinking = (firstMarker >= 0 ? raw.slice(0, firstMarker) : raw).trim();
  if (firstMarker < 0) return { thinking, guesses: [] };

  const guesses: DivinerGuess[] = [];
  for (const block of raw.split(MARKER_GUESS).slice(1)) {
    const guess = fieldValue(block, 'guess');
    if (!guess) continue;
    const hypothesis = fieldValue(block, 'hypothesis');
    const predict = parsePredict(fieldValue(block, 'predict'));
    guesses.push({ hypothesis, guess, ...(predict ? { predicted_response: predict } : {}) });
  }
  return { thinking, guesses };
}

/** Pull a `key: value` field from a block, joining wrapped continuation
 *  lines until the next field key or a blank line. */
function fieldValue(block: string, key: string): string {
  const keyRe = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, 'i');
  const parts: string[] = [];
  let collecting = false;
  for (const line of block.split('\n')) {
    const m = line.match(keyRe);
    if (m) {
      collecting = true;
      if (m[1].trim()) parts.push(m[1].trim());
      continue;
    }
    if (collecting) {
      if (FIELD_KEYS.test(line)) break;
      const t = line.trim();
      if (t) parts.push(t);
      else if (parts.length) break;
    }
  }
  return parts.join(' ').trim();
}

function parsePredict(v: string): 'cold' | 'warm' | 'hot' | null {
  const t = v.trim().toLowerCase();
  if (t.startsWith('cold')) return 'cold';
  if (t.startsWith('warm')) return 'warm';
  if (t.startsWith('hot')) return 'hot';
  return null;
}
