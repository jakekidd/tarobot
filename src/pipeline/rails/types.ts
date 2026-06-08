// The UI rails — the seam between business logic and the screen.
//
// A business-logic component (the IntroductionSurvey now; the TuningEngine
// and its Agents later) implements `RailDriver`. The UI is a thin renderer
// that reads `current()`, draws it, and calls `submit()` with what the user
// did. Nothing in this file imports React or the DOM, and nothing here knows
// which concrete driver is on the other end.
//
// That ignorance is the point: the same UI can drive a local driver today
// and a server-held driver tomorrow over a wire, with no change to either
// side. The survey is the first thing to operate these rails; everything
// after it consumes the SAME rails. Keep this file framework-free.

/** One thing for the UI to render. Tagged union so the contract grows by
 *  ADDING a case (a new step a renderer learns) rather than changing the
 *  shape every driver depends on. */
export type RailStep =
  | { kind: 'name' }
  | { kind: 'choice'; slug: string; prompt: string; options: string[] }
  | { kind: 'birthdate' }
  // ── Conjector steps (the dilemma-hunting Agent) ──
  // A guess to rate cold/warm/hot; a reframe to confirm yes/no; thinking
  // while a model call is in flight (no input — the UI shows a stall).
  | { kind: 'guess'; text: string }
  | { kind: 'reframe'; text: string }
  | { kind: 'thinking' }
  | { kind: 'done' };

/** What the UI sends back. Mirrors RailStep — each renderable step has
 *  exactly one input shape. */
export type RailInput =
  | { kind: 'name'; name: string; color: string }
  | { kind: 'choice'; value: string }
  | { kind: 'birthdate'; iso: string }
  | { kind: 'temp'; value: 'cold' | 'warm' | 'hot' }
  | { kind: 'verdict'; value: 'yes' | 'no' };

/** The seam. Implemented by business logic, consumed by the UI.
 *  `TResult` is the finished artifact a given driver produces (the
 *  IntroductionSurvey produces a RawPortrait). */
export interface RailDriver<TResult = unknown> {
  /** What to show right now. Pure — safe to call on every render. */
  current(): RailStep;
  /** Advance with the user's action on the current step. The input's
   *  `kind` is expected to match the current step's `kind`. */
  submit(input: RailInput): void;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** The finished artifact — non-null once `current().kind === 'done'`. */
  result(): TResult | null;
}
