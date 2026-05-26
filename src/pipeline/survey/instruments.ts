// Detective-emitted assertion + answer encoding.
//
// The detective writes assertions for the user to react to. The user
// picks WARMER (getting closer to true) or COLDER (moving away) —
// optionally adding a short follow-up correction. The encoding is:
//
//   'warmer'                  → { direction: 'warmer' }
//   'colder'                  → { direction: 'colder' }
//   'warmer:<text>'           → { direction: 'warmer', correction: <text> }
//   'colder:<text>'           → { direction: 'colder', correction: <text> }

/** A queued assertion the detective has emitted. */
export type AssertionInstrument = {
  kind: 'assertion';
  statement: string;
  /** Mascot stall line spoken on WARMER. */
  comment_if_warmer: string;
  /** Mascot stall line spoken on COLDER. */
  comment_if_colder: string;
};

/** The user's response to an assertion. Direction is the binary
 *  signal; optional correction is the gold (user's own words on what
 *  the real thing is). */
export type AssertionResult = {
  direction: 'warmer' | 'colder';
  correction?: string;
};

/** Discriminated union for forward-compat. Only 'assertion' today. */
export type Instrument = AssertionInstrument;

const PREFIX_WARMER = 'warmer';
const PREFIX_COLDER = 'colder';

/** Parse the UI's submitted answer string for an assertion item. */
export function parseAssertionAnswer(answer: string | string[]): AssertionResult | null {
  const raw = typeof answer === 'string' ? answer : answer[0] ?? '';
  if (raw === PREFIX_WARMER) return { direction: 'warmer' };
  if (raw === PREFIX_COLDER) return { direction: 'colder' };
  if (raw.startsWith(`${PREFIX_WARMER}:`)) {
    const correction = raw.slice(PREFIX_WARMER.length + 1).trim();
    return { direction: 'warmer', ...(correction ? { correction } : {}) };
  }
  if (raw.startsWith(`${PREFIX_COLDER}:`)) {
    const correction = raw.slice(PREFIX_COLDER.length + 1).trim();
    return { direction: 'colder', ...(correction ? { correction } : {}) };
  }
  return null;
}

/** Encode an AssertionResult to the wire format. */
export function encodeAssertionAnswer(result: AssertionResult): string {
  const prefix = result.direction === 'warmer' ? PREFIX_WARMER : PREFIX_COLDER;
  return result.correction ? `${prefix}:${result.correction}` : prefix;
}
