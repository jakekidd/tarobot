// Detective-emitted assertion + answer encoding.
//
// The subject picks COLD (wrong neighbourhood; eliminate the region),
// WARM (right neighbourhood; refine), or HOT (dead on; you've struck
// the live wire — converge and lock). All three are ABSOLUTE signals,
// not comparative — COLD doesn't mean "reverse direction," it means
// "this whole class of guesses is ruled out." HOT doesn't mean "even
// warmer," it means "stop refining — that's the thing."
//
// HOT is asymmetric on purpose: the cold side has no resolution-tier
// (cold's action is "leave," and broadness already encodes how much to
// eliminate). The warm side is where extra resolution matters — refine
// vs. commit — so HOT lives there.
//
// All three may carry an optional short correction in the subject's
// own words. Corrections are the gold signal regardless of direction.
//
// Wire format:
//   'cold'              → { direction: 'cold' }
//   'warm'              → { direction: 'warm' }
//   'hot'               → { direction: 'hot' }
//   'cold:<text>'       → { direction: 'cold', correction: <text> }
//   'warm:<text>'       → { direction: 'warm', correction: <text> }
//   'hot:<text>'        → { direction: 'hot',  correction: <text> }

/** A queued assertion the detective has emitted. */
export type AssertionInstrument = {
  kind: 'assertion';
  statement: string;
  /** Mascot stall line spoken on WARM. */
  comment_if_warm: string;
  /** Mascot stall line spoken on COLD. */
  comment_if_cold: string;
  /** Mascot stall line spoken on HOT. Optional for back-compat —
   *  detectives older than the HOT addition didn't emit this. */
  comment_if_hot?: string;
};

/** The subject's response to an assertion. */
export type AssertionResult = {
  direction: 'warm' | 'cold' | 'hot';
  correction?: string;
};

export type Instrument = AssertionInstrument;

const PREFIXES = ['cold', 'warm', 'hot'] as const;
type Prefix = (typeof PREFIXES)[number];

export function parseAssertionAnswer(answer: string | string[]): AssertionResult | null {
  const raw = typeof answer === 'string' ? answer : answer[0] ?? '';
  for (const p of PREFIXES) {
    if (raw === p) return { direction: p };
    if (raw.startsWith(`${p}:`)) {
      const correction = raw.slice(p.length + 1).trim();
      return { direction: p, ...(correction ? { correction } : {}) };
    }
  }
  return null;
}

export function encodeAssertionAnswer(result: AssertionResult): string {
  const prefix: Prefix = result.direction;
  return result.correction ? `${prefix}:${result.correction}` : prefix;
}
