// The Compiler's artifact — the clean-cut seam between the antechamber and
// the reading. AntechamberOutput goes in; CompiledBrief comes out; the
// reading consumes CompiledBrief and nothing upstream of it. Both sides are
// testable alone against this shape.

import type { DrawnCards, Profile } from '../types';
import type { Outcome } from '../seer';

export type CompiledBrief = {
  subject_name: string;
  /** The reading's spine — the question under their question (the primary
   *  confirmed reframe, when the hunt produced one). */
  intention: string;
  /** The core-story narrative (markdown prose) the seer's directors read.
   *  CARD-BLIND by design: per-card director threads must never see
   *  unflipped faces, and this brief feeds all of them. */
  prose_brief: string;
  /** The seer's current input shape, assembled honestly from the
   *  antechamber output — nothing invented, empty where we have nothing. */
  profile: Profile;
  /** Dealt at compile time (so the in-depth compiler can pre-compute
   *  per-card material during the wait; the naive one just deals). */
  drawn: DrawnCards;
  /** Augur outcome documents. The naive compiler ships none. */
  outcomes: Outcome[];
};
