import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from '../claude';
import { MODELS } from '../claude';
import type { ClatNote, SurveyAnswer, SurveyQuestion } from '../types';
import { CLAT_SYSTEM, CLAT_TOOL, type ClatOutput } from './prompts/clat';

/**
 * Fire Clat on the accumulated survey state. Returns optional outputs:
 *   - proposed_question (into priority lane)
 *   - comment (into FIFO comment queue, displayed under some later Q)
 *   - profile_notes (append-only freeform notes for the Compiler)
 *
 * Clat sees:
 *   - The full simplified Q&A history
 *   - The current upcoming question queue (priority + next pool pick)
 *   - Her own prior profile_notes (so she doesn't redundantly observe)
 *
 * Clat does NOT see:
 *   - Which question her comment will land under (the comment is decoupled
 *     from question delivery on purpose — she writes standalone observations)
 */
export async function clatReact(
  client: ClaudeClient,
  pool: SurveyQuestion[],
  answerLog: SurveyAnswer[],
  upcomingQueueSimplified: Array<{ id: string; text: string; category: string }>,
  priorNotes: ClatNote[],
): Promise<ClatOutput> {
  const simplifiedHistory = answerLog.map((a) => {
    const q = pool.find((x) => x.id === a.question_id);
    return {
      q: q?.text ?? a.question_id,
      category: q?.category,
      picked: a.passed ? '[pass]' : a.picked.join(' + '),
      interpretation: a.passed
        ? undefined
        : a.picked.map((p) => q?.interpretation[p]),
    };
  });

  const userMessage = {
    history: simplifiedHistory,
    upcoming_questions: upcomingQueueSimplified,
    your_prior_notes: priorNotes,
    instructions:
      "you are running concurrently; you may not fire on every answer. consider the recent shape of the case. emit only what's worth emitting — nothing is also a valid response.",
  };

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 900,
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
