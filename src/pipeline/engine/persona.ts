import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from '../claude';
import { MODELS } from '../claude';
import type { EngineState, Question } from '../types';
import { PERSONA_SYSTEM, PERSONA_TOOL, type PersonaTurnOutput } from './prompts/persona';

/**
 * Render persona's next utterance for `currentQuestion`, given the
 * brief/highlights/transcript and (if applicable) the user's last pick.
 *
 * The model receives the pre-baked response for the picked option as a
 * starting point — it may paraphrase, but the substance is set by
 * cognition.
 */
export async function personaSpeak(
  client: ClaudeClient,
  state: EngineState,
  currentQuestion: Question,
  pickedIndex: number | null,
): Promise<PersonaTurnOutput> {
  const lastUserLine = pickedIndex !== null
    ? state.transcript[state.transcript.length - 1]
    : null;

  const userPayload = {
    brief: state.profile.brief,
    highlights_on_my_mind: state.profile.highlights.map((h) => ({
      topic: h.topic,
      salience: h.salience,
    })),
    transcript_with_marginalia: state.transcript.map((line) => ({
      speaker: line.speaker,
      content: line.content,
      thoughts: line.thoughts,
    })),
    user_last_pick: pickedIndex !== null && lastUserLine
      ? { picked_option: lastUserLine.content, picked_index: pickedIndex }
      : null,
    current_question: {
      prompt: currentQuestion.prompt,
      options: currentQuestion.options,
      pre_baked_responses: currentQuestion.responses,
      pre_baked_response_for_pick: pickedIndex !== null
        ? currentQuestion.responses[pickedIndex] ?? null
        : null,
    },
  };

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 800,
    system: PERSONA_SYSTEM,
    tools: [PERSONA_TOOL],
    tool_choice: { type: 'tool', name: 'persona_speak' },
    messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
  });

  return readToolUse<PersonaTurnOutput>(response, 'persona_speak');
}

function readToolUse<T>(response: Anthropic.Message, name: string): T {
  const block = response.content.find(
    (b) => b.type === 'tool_use' && b.name === name,
  );
  if (!block || block.type !== 'tool_use') {
    throw new Error(`persona: tool '${name}' not called (stop_reason=${response.stop_reason})`);
  }
  return block.input as T;
}
