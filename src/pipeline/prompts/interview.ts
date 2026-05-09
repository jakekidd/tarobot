// Prompt template for one interview turn.
// Filled in during the cognition pipeline phase.
//
// The cognition is hunting for the user's TargetChoice — stated, inferred,
// or constructed. Each call returns structured state updates plus the
// next user-facing message via tool use.

export const INTERVIEW_TURN_SYSTEM = '' as const; // TODO

export const INTERVIEW_TURN_TOOL = {
  name: 'interview_turn',
  description:
    'record cognition state updates and the next message to the user',
  // input_schema filled in during implementation
} as const;
