// Tuning-stage artifacts.
//
// The Condenser paints a Portrait (markdown — a vignette the next AI reads,
// NOT a schema) from the survey's RawPortrait. The Conjector then hunts
// DILEMMAS: it guesses where the user's charge lives, reads cold/warm/hot,
// commits a reframe (the question under their question), and banks each as a
// closed branch. The banked dilemmas are the Conjector → Compiler artifact.

import type { RawPortrait } from '../introduction-survey';

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

/** One move the Conjector made in a thread and the player's read of it. */
export type ConjectureRecord = {
  kind: 'guess' | 'commit';
  text: string;
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
  /** The Diviner's first-person close — the deepen input for the experts. */
  summary_md: string;
  /** Which portrait leads this thread consumed (marked CLAIMED for re-root). */
  claimed_leads: string[];
  /** The guess/response trail, for logging and deepen. */
  trail: ConjectureRecord[];
};

/** The Conjector → Compiler artifact: the banked dilemmas, in find order,
 *  UNRANKED. Ranking (which becomes the reading's spine) is downstream. */
export type ConjectorResult = {
  dilemmas: Dilemma[];
};
