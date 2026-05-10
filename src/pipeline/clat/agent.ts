import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from '../claude';
import { MODELS } from '../claude';
import type { SurveyAnswer, SurveyQuestion } from '../types';
import { CLAT_SYSTEM, CLAT_TOOL, type ClatOutput } from './prompts/clat';

/**
 * Fire Clat on a user answer. Returns the agent's reaction:
 * an optional flavor line and 0-2 queued follow-up questions.
 *
 * Fires in parallel with the next-question pick — the queue drains
 * lazily so latency is hidden.
 */
export async function clatReact(
  client: ClaudeClient,
  pool: SurveyQuestion[],
  answerLog: SurveyAnswer[],
  latestAnswer: SurveyAnswer,
): Promise<ClatOutput> {
  const latestQ = pool.find((q) => q.id === latestAnswer.question_id);
  const userMessage = JSON.stringify({
    latest_question: latestQ ? { id: latestQ.id, text: latestQ.text } : null,
    latest_answer: latestAnswer,
    full_log: answerLog,
  }, null, 2);

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 800,
    system: CLAT_SYSTEM,
    tools: [CLAT_TOOL],
    tool_choice: { type: 'tool', name: 'clat_react' },
    messages: [{ role: 'user', content: userMessage }],
  });

  return readToolUse<ClatOutput>(response, 'clat_react');
}

function readToolUse<T>(response: Anthropic.Message, name: string): T {
  const block = response.content.find(
    (b) => b.type === 'tool_use' && b.name === name,
  );
  if (!block || block.type !== 'tool_use') {
    throw new Error(`clat: tool '${name}' not called (stop_reason=${response.stop_reason})`);
  }
  return block.input as T;
}
