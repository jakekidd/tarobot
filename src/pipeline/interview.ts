import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from './claude';
import { MODELS } from './claude';
import {
  INTERVIEW_OPEN_SYSTEM,
  INTERVIEW_TURN_SYSTEM,
  INTERVIEW_TURN_TOOL,
  type InterviewTurnInput,
} from './prompts/interview';
import {
  FINALIZE_SYSTEM,
  FINALIZE_TOOL,
  type FinalizeInput,
} from './prompts/finalize';
import type {
  BaseProfile,
  Disclosure,
  EnrichedProfile,
  Hook,
  InterviewState,
} from './types';

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
      hooks: surveyHooks(base.survey),
      patterns: {
        language_register: 'unknown',
        self_reflection_level: 'medium',
        skepticism_posture: 'curious',
        avoidances: [],
      },
      flags: {
        crisis_indicators: false,
        sensitive_topics: [],
      },
    },
    turns_used: 0,
    turns_remaining: turnBudget,
    closed: false,
  };
}

/** Produce the assistant's opening message (no user input yet). */
export async function openInterview(
  client: ClaudeClient,
  state: InterviewState,
): Promise<InterviewState> {
  const sys = INTERVIEW_OPEN_SYSTEM.replace(
    '{survey_json}',
    JSON.stringify(state.base_profile.survey, null, 2),
  );

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 1024,
    system: sys,
    tools: [INTERVIEW_TURN_TOOL],
    tool_choice: { type: 'tool', name: 'interview_turn' },
    // Anthropic Messages API requires at least one user message; this is the
    // semantic "begin" cue. The actual greeting comes back from the tool call.
    messages: [{ role: 'user', content: '<<begin>>' }],
  });

  const args = readToolUse<InterviewTurnInput>(response, 'interview_turn');
  return applyTurn(state, args, /*incrementBudget=*/ false);
}

/** Advance the interview by one turn. */
export async function interviewTurn(
  client: ClaudeClient,
  state: InterviewState,
  userMessage: string,
): Promise<InterviewState> {
  if (state.closed) return state;

  const historyWithUser = [
    ...state.history,
    { role: 'user' as const, content: userMessage },
  ];

  const sys = INTERVIEW_TURN_SYSTEM
    .replace('{survey_json}', JSON.stringify(state.base_profile.survey, null, 2))
    .replace('{profile_json}', JSON.stringify(state.partial_profile, null, 2))
    .replace('{candidates_json}', JSON.stringify(state.candidates, null, 2))
    .replace('{turns_remaining}', String(state.turns_remaining));

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 1500,
    system: sys,
    tools: [INTERVIEW_TURN_TOOL],
    tool_choice: { type: 'tool', name: 'interview_turn' },
    messages: historyWithUser.map((m) => ({ role: m.role, content: m.content })),
  });

  const args = readToolUse<InterviewTurnInput>(response, 'interview_turn');
  return applyTurn({ ...state, history: historyWithUser }, args, true);
}

/** Crystallise the running state into a finalized EnrichedProfile. */
export async function finalizeProfile(
  client: ClaudeClient,
  state: InterviewState,
): Promise<EnrichedProfile> {
  const sys = FINALIZE_SYSTEM
    .replace('{survey_json}', JSON.stringify(state.base_profile.survey, null, 2))
    .replace('{partial_profile_json}', JSON.stringify(state.partial_profile, null, 2))
    .replace('{candidates_json}', JSON.stringify(state.candidates, null, 2));

  // If conversation is empty (which shouldn't happen but defensive), feed
  // the survey as the user message; otherwise reuse the real history.
  const messages: Anthropic.MessageParam[] =
    state.history.length > 0
      ? state.history.map((m) => ({ role: m.role, content: m.content }))
      : [{ role: 'user', content: JSON.stringify(state.base_profile.survey) }];

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 3500,
    system: sys,
    tools: [FINALIZE_TOOL],
    tool_choice: { type: 'tool', name: 'finalize_profile' },
    messages,
  });

  const args = readToolUse<FinalizeInput>(response, 'finalize_profile');

  const survey = state.base_profile.survey;
  const carriedHooks = state.partial_profile.hooks ?? [];
  const newHooks = (args.hooks ?? []).filter(
    (h) => !carriedHooks.some((c) => c.detail === h.detail),
  );

  return {
    name: survey.name,
    birth_month_day: survey.birth_month_day,
    survey,
    disclosures: state.partial_profile.disclosures ?? [],
    patterns: args.patterns,
    hooks: [...carriedHooks, ...newHooks],
    target_choice: args.target_choice,
    change_vector: args.change_vector,
    flags: {
      crisis_indicators: !!state.partial_profile.flags?.crisis_indicators,
      sensitive_topics: args.sensitive_topics ?? [],
    },
  };
}

// ─── Helpers ────────────────────────────────────────────

function applyTurn(
  state: InterviewState,
  args: InterviewTurnInput,
  incrementBudget: boolean,
): InterviewState {
  const turnsUsed = state.turns_used + (incrementBudget ? 1 : 0);
  const turnsRemaining = incrementBudget
    ? Math.max(0, state.turns_remaining - 1)
    : state.turns_remaining;

  // Tag and merge new disclosures.
  const tagged: Disclosure[] = (args.new_disclosures ?? []).map((d) => ({
    ...d,
    source: 'interview' as const,
  }));

  // Tag hooks with the turn they came from.
  const turnTag = `interview-turn-${turnsUsed}`;
  const newHooks: Hook[] = (args.new_hooks ?? []).map((h) => ({
    detail: h.detail,
    source: turnTag,
    confidence: h.confidence,
  }));

  const partial = state.partial_profile;
  const updatedProfile = {
    ...partial,
    disclosures: [...(partial.disclosures ?? []), ...tagged],
    hooks: [...(partial.hooks ?? []), ...newHooks],
    patterns: {
      ...(partial.patterns ?? {
        language_register: 'unknown',
        self_reflection_level: 'medium' as const,
        skepticism_posture: 'curious' as const,
        avoidances: [],
      }),
      ...args.patterns_update,
    },
    flags: {
      crisis_indicators:
        !!args.crisis_flag || !!partial.flags?.crisis_indicators,
      sensitive_topics: partial.flags?.sensitive_topics ?? [],
    },
  };

  const assistantMessage = {
    role: 'assistant' as const,
    content: args.message_to_user,
  };

  const closed =
    args.decision === 'close' ||
    !!args.crisis_flag ||
    turnsRemaining <= 0;
  const closingReason: InterviewState['closing_reason'] = args.crisis_flag
    ? 'crisis'
    : args.decision === 'close'
      ? 'cognition'
      : turnsRemaining <= 0
        ? 'budget'
        : undefined;

  return {
    ...state,
    history: [...state.history, assistantMessage],
    candidates: args.candidate_updates ?? state.candidates,
    partial_profile: updatedProfile,
    turns_used: turnsUsed,
    turns_remaining: turnsRemaining,
    closed,
    closing_reason: closingReason,
  };
}

function surveyHooks(survey: BaseProfile['survey']): Hook[] {
  const hooks: Hook[] = [];
  if (survey.familiar_pick) {
    hooks.push({
      detail: `chose ${survey.familiar_pick} as familiar`,
      source: 'survey',
      confidence: 0.5,
    });
  }
  if (survey.register_pick) {
    hooks.push({
      detail: `said this year felt like ${survey.register_pick}`,
      source: 'survey',
      confidence: 0.6,
    });
  }
  if (survey.on_my_mind) {
    hooks.push({
      detail: `on their mind: "${survey.on_my_mind}"`,
      source: 'survey',
      confidence: 0.85,
    });
  }
  if (survey.want_from_reading) {
    hooks.push({
      detail: `came wanting ${survey.want_from_reading}`,
      source: 'survey',
      confidence: 0.5,
    });
  }
  return hooks;
}

function readToolUse<T>(
  response: Anthropic.Message,
  expectedName: string,
): T {
  const block = response.content.find(
    (b) => b.type === 'tool_use' && b.name === expectedName,
  );
  if (!block || block.type !== 'tool_use') {
    throw new Error(
      `cognition did not call the ${expectedName} tool (stop_reason=${response.stop_reason})`,
    );
  }
  return block.input as T;
}
