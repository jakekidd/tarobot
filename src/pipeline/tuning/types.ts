// Tuning-stage artifacts.
//
// The Condenser paints a Portrait (markdown — a vignette the next AI reads,
// NOT a schema) from the survey's RawPortrait. The Conjector then hunts
// DILEMMAS: it guesses where the user's charge lives, reads cold/warm/hot,
// commits a reframe (the question under their question), and banks each as a
// closed branch. The banked dilemmas are the Conjector → Compiler artifact.

import type { IdentityBlock, RawPortrait } from '../introduction-survey';

/** The Condenser's output and the Conjector's primary input. Markdown prose
 *  (AI-for-AI context breathes better as prose than JSON), with the
 *  RawPortrait carried as appendix for when the Conjector wants to verify a
 *  specific against the raw evidence. */
export type Portrait = {
  /** The condensed vignette: central leads (confidence-tagged), patterns,
   *  tensions, cast, posture. Authored by the Condenser. */
  markdown: string;
  /** The deterministic survey output, for appendix reference. */
  raw: RawPortrait;
};

/** One move the Conjector made in a thread and the player's read of it.
 *  `dimension` is the axis the move probed (identity / stakes / timing / …) —
 *  it rides the trail and feeds back into later move calls so the thread
 *  covers new ground instead of re-mining a confirmed hit (the within-thread
 *  analog of the negative-space stack). */
export type ConjectureRecord = {
  kind: 'guess' | 'commit';
  text: string;
  dimension?: string;
  response: 'cold' | 'warm' | 'hot' | 'yes' | 'no' | null;
};

/** One closed branch: a located dilemma, its committed reframe, and the
 *  first-person summary the Compiler will deepen. `confirmed` is the player's
 *  YES on the reframe; soft-closed branches (budget spent, or NO) carry it
 *  false but are still usable. */
export type Dilemma = {
  id: string;
  /** The region of life this thread worked, in the user's terms. */
  territory: string;
  /** The committed reframe — the question under their question. */
  reframe: string;
  confirmed: boolean;
  /** A crisp fragment naming what this thread was about — the negative-space
   *  marker, fed forward so later threads search different territory (kept on
   *  the dilemma for posterity / downstream). */
  hypothesis: string;
  /** The Conjector's first-person close — the deepen input for the experts. */
  summary_md: string;
  /** Which portrait leads this thread consumed (marked CLAIMED for re-root). */
  claimed_leads: string[];
  /** The guess/response trail, for logging and deepen. */
  trail: ConjectureRecord[];
};

/** Why the hunt stopped. `error` means a model call died mid-hunt and the
 *  session shipped whatever was already banked. */
export type ConjectorEnd = 'cap' | 'budget' | 'exhausted' | 'error';

/** The Conjector → Compiler artifact: the banked dilemmas, in find order,
 *  UNRANKED. Ranking (which becomes the reading's spine) is downstream. */
export type ConjectorResult = {
  dilemmas: Dilemma[];
  ended: ConjectorEnd;
  moves_spent: number;
};

/** The antechamber's single handoff artifact — everything downstream (the
 *  Compiler, and later the eval rig) needs in one bundle. The Portrait rides
 *  along so a hunt can always be correlated with the read it ran off. */
export type AntechamberOutput = {
  identity: IdentityBlock;
  /** facet slug → the answer given (write-ins verbatim). */
  raw_picks: Record<string, string>;
  portrait_md: string;
  dilemmas: Dilemma[];
  ended: ConjectorEnd;
  moves_spent: number;
};
