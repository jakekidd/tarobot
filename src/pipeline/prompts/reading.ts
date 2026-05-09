// Prompt template for the reading construction call.
// Filled in during the cognition pipeline phase.
//
// Inputs: EnrichedProfile + DrawnCards (cards laid against spread positions).
// Output via tool use: theme, arc, chapter per position (clinical prediction
// + tarobot-voiced spoken_text), and closing_text.
//
// Spread-aware: positions come from drawn.spread.positions, not hardcoded.

export const READING_SYSTEM = '' as const; // TODO

export const READING_TOOL = {
  name: 'construct_reading',
  description: 'commit a complete reading (theme, arc, chapters, closing)',
  // input_schema filled in during implementation
} as const;
