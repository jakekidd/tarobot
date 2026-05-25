// v3 instruments — the detective's vocabulary for testing candidate
// Dilemmas.
//
// Phase 3 ships ONE instrument end-to-end: the assertion. The other
// three (forced_choice_with_none / compare_ab / near_miss) are
// scaffolded in the discriminated union but get implemented in a later
// wave once the assertion loop has been walked.
//
// Each instrument carries pre-baked mascot lines (comment_if_<answer>)
// so the user-facing response is zero-LLM-latency. The mascot speaks
// them immediately on tap; that 1-3s buys cover for the next-instrument
// generation in the background. They are not just stalls — they're
// in-character mascot lines that also land the moment.
//
// Assertion result encoding (lives on PickEvent.instrument_result):
//   { outcome: 'confirmed' }
//   { outcome: 'rejected' }
//   { outcome: 'rejected_with_correction', correction: <user text> }
//
// The PickEvent.answer string remains the wire-format the UI submits
// ('true' | 'false' | 'corrected:<text>'); the engine parses it into
// the structured result and into a VerbatimEntry on corrections.

/** The detective's hypothesis-test vocabulary. Discriminated by `kind`.
 *  Phase 3: only 'assertion' is wired through to the UI and runtime;
 *  the others land in later waves. */
export type Instrument = AssertionInstrument;
// Later: | ForcedChoiceWithNoneInstrument | CompareAbInstrument | NearMissInstrument

/** A specific, falsifiable claim about the subject. The most-used
 *  exploit instrument — emitted when the detective wants to confirm
 *  or sharpen a candidate Dilemma. */
export type AssertionInstrument = {
  kind: 'assertion';
  /** The claim itself. MUST be specific enough that the user can
   *  reject it. "you feel things deeply but keep some protected" is
   *  Barnum — returns zero bits even when confirmed. */
  statement: string;
  /** Stable id of the candidate Dilemma this assertion tests. The
   *  detective owns this id space; for Phase 3 (single-leader model)
   *  it's typically 'leading'. */
  predicts_dilemma_id: string;
  /** Mascot line spoken on user-confirms. Short, in-character. */
  comment_if_true: string;
  /** Mascot line spoken on user-rejects. Short, in-character. Should
   *  NOT shame the rejection — a 'false' that lands a good correction
   *  is the highest-value outcome of the survey. */
  comment_if_false: string;
  /** Optional one-tap correction options shown after 'false'. The
   *  detective's best-guess inversions of the statement. Text fallback
   *  is always available; correction_inversions just save the user
   *  typing when one of the guesses lands. */
  correction_inversions?: string[];
};

/** Logged outcome of an assertion answer. Stored on PickEvent so the
 *  debug panel (and any future telemetry rig) can compute the
 *  confirmed / rejected / rejected-with-correction rate without
 *  re-parsing the answer string. */
export type AssertionResult =
  | { outcome: 'confirmed' }
  | { outcome: 'rejected' }
  | { outcome: 'rejected_with_correction'; correction: string };

// ─── Wire format helpers ────────────────────────────────

/** Parse the UI-submitted answer string for an assertion item.
 *  Wire format:
 *    'true'              → confirmed
 *    'false'             → rejected
 *    'corrected:<text>'  → rejected_with_correction. text is trimmed.
 *  Returns null on any unparseable input — caller decides how to
 *  handle (typically: log warning, treat as rejected). */
export function parseAssertionAnswer(answer: string | string[]): AssertionResult | null {
  const raw = typeof answer === 'string' ? answer : answer[0] ?? '';
  if (raw === 'true') return { outcome: 'confirmed' };
  if (raw === 'false') return { outcome: 'rejected' };
  if (raw.startsWith('corrected:')) {
    const correction = raw.slice('corrected:'.length).trim();
    if (correction.length === 0) return { outcome: 'rejected' };
    return { outcome: 'rejected_with_correction', correction };
  }
  return null;
}

/** Encode a UI answer for an assertion item. */
export function encodeAssertionAnswer(
  result: AssertionResult,
): string {
  if (result.outcome === 'confirmed') return 'true';
  if (result.outcome === 'rejected') return 'false';
  return `corrected:${result.correction}`;
}
