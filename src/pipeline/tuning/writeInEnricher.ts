// writeInEnricher — the AI counterpart to the survey's authored channels.
//
// When a player WRITES IN an answer instead of picking one, the survey captures
// their raw text but cannot produce the channels (indicators / implications /
// identities / shadow) or a weight for it — that needs a model, and the survey
// runs NO AI. This is where that enrichment happens: a one-shot call that reads
// the facet and the typed answer and returns the same shape an authored option
// carries, plus an approximate weight, so a write-in folds into the RawPortrait
// exactly like a picked option.
//
// NOT IMPLEMENTED this pass. Free-text answers currently ride through with
// empty channels (their raw text is preserved on the reading); they get
// enriched here once the TuningEngine is wired. The prompt is written now so
// the contract is committed.

import type { SurveyFacet } from '../introduction-survey/schema';
import type { Channels } from '../introduction-survey/types';

/** What an authored option carries, produced on the fly for a write-in. */
export type WriteInEnrichment = Channels & {
  /** One line: what NOT picking this would mean. */
  shadow: string;
  /** 0-3 valence, matching the authored weight scale. */
  weight: number;
};

export const WRITE_IN_ENRICHER_PROMPT = `you are enriching a write-in answer to a tarot intake survey. the player chose to type their own answer instead of picking a listed option. produce the same authored channels a listed option carries, plus a weight, so their answer folds into the portrait identically.

the question and its target are given, along with the listed options (with their channels) for calibration — match their register, brevity, and discipline. all output is lowercase sentence fragments.

channels:
- indicators: FACTS, near-certain (~99% true of anyone who'd give this answer). if it isn't near-certain, demote to an implication.
- implications: speculative LEADS, could be otherwise. hypotheses, not facts.
- identities: competing, mutually-exclusive character-types the reading would resolve. distinct and recognizable, never vague flattery.
- shadow: ONE line — what it would mean to NOT give this answer.
- hooks: leave empty.
- notes: leave empty.
- weight: an integer 0-3. 0 inert, 1 mild, 2 warm (a real lead), 3 hot (load-bearing). judge the emotional + meaningful valence of THIS answer relative to the listed options' weights.

stay faithful to what they actually wrote. do not invent specifics they didn't say; read what the words imply, not what you wish they meant.`;

/** Enrich a write-in into authored-option shape. Throws until the AI stage is
 *  wired (the survey itself never calls this — it runs no AI). */
export function enrichWriteIn(_facet: SurveyFacet, _answer: string): Promise<WriteInEnrichment> {
  throw new Error('enrichWriteIn is not implemented — the survey runs no AI; this is a TuningEngine pre-step.');
}
