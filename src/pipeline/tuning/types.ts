// Tuning-stage artifacts.
//
// The TuningEngine paints a Portrait from the survey's RawPortrait, then its
// Agents hunt CHARGES — regions of live weight (stress, grief, regret,
// dread; NOT necessarily a fork). Charges are banked depth-first and left
// UNRANKED; the Compiler, collaborating with the player, picks which charge
// becomes the reading's spine. (This replaces the older single-"Dilemma"
// goalpost — there may be several live charges, and the user chooses.)

import type { RawPortrait } from '../introduction-survey';

/** A Portrait is NOT a picture — it's a light vignette profile, a brief read
 *  of the person painted (one model call) from the RawPortrait as the
 *  TuningEngine's first step. Stub shape for now; the painter is a later pass. */
export type Portrait = {
  /** Prose vignette — the confident body (built from indicators + identities). */
  body: string;
  /** Lower-confidence leads (inferences), fenced so the reading doesn't over-commit. */
  leads: string[];
  /** The survey output it was painted from, carried for downstream reference. */
  raw: RawPortrait;
};

/** One region of live weight the Sounder has located. */
export type Charge = {
  /** Where the weight lives, in the user's terms ("work", "my brother"). */
  region: string;
  /** 0..1 — how sharply located versus still vague. */
  specificity: number;
  /** Harvested concrete specifics — phrases, names, details. */
  features: string[];
  /** The player's last read on it. */
  confirmation: 'unconfirmed' | 'cold' | 'warm' | 'hot';
};

/** The Tuning → Compiler artifact: banked charges, depth-first, UNRANKED.
 *  Ranking is the Compiler's job (with the player). */
export type ChargeMap = {
  charges: Charge[];
};
