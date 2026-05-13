import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from '../claude';
import { MODELS } from '../claude';
import type { SurveyAnswer, SurveyQuestion } from '../types';
import { CLAT_SYSTEM, CLAT_TOOL, type ClatOutput } from './prompts/clat';

/**
 * Fire Clat on a user answer. Returns the agent's reaction:
 * - an optional sidebar comment on the previous answer (shown UNDER
 *   the next question that has already been asked)
 * - 0-2 priority-lane follow-up questions
 *
 * The next question is passed in so Clat can frame the sidebar comment
 * without colliding with what the user is being asked. Q&A history is
 * passed simplified (Q text + picked option) — the full SurveyQuestion
 * objects would bloat context without adding signal.
 */
export async function clatReact(
  client: ClaudeClient,
  pool: SurveyQuestion[],
  answerLog: SurveyAnswer[],
  latestAnswer: SurveyAnswer,
  nextQuestion: SurveyQuestion | null,
): Promise<ClatOutput> {
  const simpleHistory = answerLog.map((a) => {
    const q = pool.find((x) => x.id === a.question_id);
    return {
      q: q?.text ?? a.question_id,
      picked: a.passed ? '[pass]' : a.picked.join(' + '),
    };
  });

  const latestQ = pool.find((q) => q.id === latestAnswer.question_id);

  const userMessage = {
    history_simplified: simpleHistory,
    latest_answer: {
      question: latestQ?.text,
      picked: latestAnswer.passed ? '[pass]' : latestAnswer.picked.join(' + '),
      category: latestQ?.category,
      interpretation_per_pick: latestAnswer.picked.map((p) => latestQ?.interpretation[p]),
    },
    next_question_already_being_asked: nextQuestion ? {
      text: nextQuestion.text,
      options: nextQuestion.options,
      category: nextQuestion.category,
    } : null,
    note_for_clat:
      "the user has already been shown the 'next_question'. any flavor_reaction you produce will be displayed UNDERNEATH it as a sidebar — your comment is reflection on the LATEST answer, not setup for the next question. if no useful comment fits, omit it.",
  };

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 800,
    system: CLAT_SYSTEM,
    tools: [CLAT_TOOL],
    tool_choice: { type: 'tool', name: 'clat_react' },
    messages: [{ role: 'user', content: JSON.stringify(userMessage, null, 2) }],
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
