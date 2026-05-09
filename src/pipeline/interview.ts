import type { ClaudeClient } from './claude';
import type {
  BaseProfile,
  EnrichedProfile,
  InterviewState,
} from './types';

/** Fresh interview state seeded from the survey. */
export function startInterview(base: BaseProfile, turnBudget = 7): InterviewState {
  return {
    base_profile: base,
    history: [],
    candidates: [],
    partial_profile: {
      name: base.survey.name,
      birth_month_day: base.survey.birth_month_day,
      survey: base.survey,
      disclosures: [],
      hooks: [],
    },
    turns_used: 0,
    turns_remaining: turnBudget,
    closed: false,
  };
}

/**
 * Advance the interview by one cognition turn.
 * Cognition reads the user's last message, updates state, decides its move,
 * and produces the next assistant message.
 *
 * Implemented during the cognition pipeline phase.
 */
export async function interviewTurn(
  _client: ClaudeClient,
  _state: InterviewState,
  _userMessage: string,
): Promise<InterviewState> {
  throw new Error('interviewTurn: not yet implemented');
}

/**
 * Produce the assistant's opening message (no user input yet).
 * Implemented during the cognition pipeline phase.
 */
export async function openInterview(
  _client: ClaudeClient,
  _state: InterviewState,
): Promise<InterviewState> {
  throw new Error('openInterview: not yet implemented');
}

/**
 * Crystallise the running state into a finalized EnrichedProfile.
 * Constructs a TargetChoice if none has surfaced.
 *
 * Implemented during the cognition pipeline phase.
 */
export async function finalizeProfile(
  _client: ClaudeClient,
  _state: InterviewState,
): Promise<EnrichedProfile> {
  throw new Error('finalizeProfile: not yet implemented');
}
