// Prompt template for finalizing the EnrichedProfile after the interview loop.
// Filled in during the cognition pipeline phase.
//
// Takes accumulated state (disclosures, candidates, history) and produces a
// fully realized EnrichedProfile with TargetChoice. Constructs a choice
// from highest-tension domain if nothing concrete surfaced.

export const FINALIZE_SYSTEM = '' as const; // TODO

export const FINALIZE_TOOL = {
  name: 'finalize_profile',
  description: 'commit the final EnrichedProfile and TargetChoice',
  // input_schema filled in during implementation
} as const;
