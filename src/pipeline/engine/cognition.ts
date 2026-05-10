import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from '../claude';
import { MODELS } from '../claude';
import type { EngineState, Question } from '../types';
import { COGNITION_SYSTEM, COGNITION_TOOL, type CognitionOutput } from './prompts/cognition';
import {
  applyHighlightsUpdate,
  applyProfileDeltas,
  appendHindsight,
  enqueueQuestion,
  QUEUE_MAX_DEPTH,
} from './state';

/**
 * Fire cognition on the latest transcript line. Single fat call covering
 * all four subagent slots + an optional next-question generator.
 *
 * Returns the updated EngineState. Hindsight is appended to the line at
 * `latestLineIndex`, profile is delta-applied, highlights are updated,
 * brief is replaced if action='rewrite', and a Question is enqueued if
 * `next_question` is provided and the queue has room.
 */
export async function cognitionTick(
  client: ClaudeClient,
  state: EngineState,
  latestLineIndex: number,
): Promise<EngineState> {
  const userPayload = {
    latest_line: state.transcript[latestLineIndex],
    transcript: state.transcript,
    profile: state.profile,
    queue_depth: state.question_queue.length,
    queue_room: QUEUE_MAX_DEPTH - state.question_queue.length,
    turn: state.turn_count,
  };

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 4500,
    system: COGNITION_SYSTEM,
    tools: [COGNITION_TOOL],
    tool_choice: { type: 'tool', name: 'cognition_tick' },
    messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
  });

  const out = readToolUse<CognitionOutput>(response, 'cognition_tick');
  return applyCognitionOutput(state, latestLineIndex, out);
}

export function applyCognitionOutput(
  state: EngineState,
  latestLineIndex: number,
  out: CognitionOutput,
): EngineState {
  let next = state;

  // 1. Append hindsight to the latest line
  if (out.hindsight?.thoughts && out.hindsight.thoughts.length > 0) {
    next = appendHindsight(next, latestLineIndex, out.hindsight.thoughts);
  }

  // 2. Apply profile deltas
  if (out.profile_deltas) {
    const updatedProfile = applyProfileDeltas(next.profile, out.profile_deltas);
    next = { ...next, profile: updatedProfile };
  }

  // 3. Apply highlights update
  if (out.highlights_update) {
    const updatedHighlights = applyHighlightsUpdate(
      next.profile.highlights,
      out.highlights_update,
      next.turn_count,
    );
    next = {
      ...next,
      profile: { ...next.profile, highlights: updatedHighlights },
    };
  }

  // 4. Apply brief update
  if (out.brief_update?.action === 'rewrite' && out.brief_update.new_brief) {
    next = {
      ...next,
      profile: { ...next.profile, brief: out.brief_update.new_brief },
    };
  }

  // 5. Enqueue next question if provided and there's room
  if (out.next_question && next.question_queue.length < QUEUE_MAX_DEPTH) {
    const q: Question = {
      id: out.next_question.id,
      prompt: out.next_question.prompt,
      options: out.next_question.options.slice(0, 4),
      responses: out.next_question.responses.slice(0, 4),
      fork_lead: out.next_question.fork_lead,
      depth: out.next_question.depth,
      meta: {
        based_on_profile_version: next.profile.version,
        rationale: out.next_question.rationale,
      },
    };
    next = enqueueQuestion(next, q);
  }

  return next;
}

function readToolUse<T>(response: Anthropic.Message, name: string): T {
  const block = response.content.find(
    (b) => b.type === 'tool_use' && b.name === name,
  );
  if (!block || block.type !== 'tool_use') {
    throw new Error(`cognition: tool '${name}' not called (stop_reason=${response.stop_reason})`);
  }
  return block.input as T;
}
