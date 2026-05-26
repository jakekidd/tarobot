// Detective-emitted assertion + answer encoding.
//
// The user picks WARM (this assertion is in the right neighborhood)
// or COLD (this neighborhood is wrong) — optionally with a short
// follow-up correction. WARM/COLD is an ABSOLUTE signal, not
// comparative — the detective reads COLD as "eliminate this region,"
// not "reverse direction." This avoids hill-climbing oversteer.
//
// Wire format:
//   'warm'              → { direction: 'warm' }
//   'cold'              → { direction: 'cold' }
//   'warm:<text>'       → { direction: 'warm', correction: <text> }
//   'cold:<text>'       → { direction: 'cold', correction: <text> }

/** A queued assertion the detective has emitted. */
export type AssertionInstrument = {
  kind: 'assertion';
  statement: string;
  /** Mascot stall line spoken on WARM. */
  comment_if_warm: string;
  /** Mascot stall line spoken on COLD. */
  comment_if_cold: string;
};

/** The user's response to an assertion. */
export type AssertionResult = {
  direction: 'warm' | 'cold';
  correction?: string;
};

export type Instrument = AssertionInstrument;

const PREFIX_WARM = 'warm';
const PREFIX_COLD = 'cold';

export function parseAssertionAnswer(answer: string | string[]): AssertionResult | null {
  const raw = typeof answer === 'string' ? answer : answer[0] ?? '';
  if (raw === PREFIX_WARM) return { direction: 'warm' };
  if (raw === PREFIX_COLD) return { direction: 'cold' };
  if (raw.startsWith(`${PREFIX_WARM}:`)) {
    const correction = raw.slice(PREFIX_WARM.length + 1).trim();
    return { direction: 'warm', ...(correction ? { correction } : {}) };
  }
  if (raw.startsWith(`${PREFIX_COLD}:`)) {
    const correction = raw.slice(PREFIX_COLD.length + 1).trim();
    return { direction: 'cold', ...(correction ? { correction } : {}) };
  }
  return null;
}

export function encodeAssertionAnswer(result: AssertionResult): string {
  const prefix = result.direction === 'warm' ? PREFIX_WARM : PREFIX_COLD;
  return result.correction ? `${prefix}:${result.correction}` : prefix;
}
