// Bot — picks an answer to the current question as if it were the archetype.
// Calls Haiku for speed. Returns the chosen option(s) and a simulated latency.

import type { ClaudeClient } from '../../src/pipeline/claude';
import type { Archetype } from './archetype';
import type { RenderedQuestion } from '../../src/pipeline/antechamber';
import { recordTokens } from './tokens';

const BOT_SYSTEM = `you are role-playing as a specific person taking a multiple-choice survey. you will be given:
  - the archetype JSON describing who you are
  - the transcript of the antechamber so far (your past Q+A pairs)
  - the current question, its format, and its available options

your job: answer the CURRENT question as this person would. respond with a single tool call.

OUTPUT:
- chosen: for "choice", "binary", or "matrix" formats — exactly one option text from the available list. for "multi" — an array of 1-N options. for "text" — an arbitrary short string. for "date" — "YYYY-MM-DD" matching the archetype's birthday.
- latency_ms: how long this person would take to answer. fast types: 800-1500. deliberate: 2000-4500. hesitant: 3500-8000. chaotic: variable.
- _internal_note: optional 1-line note explaining the pick. for debugging.

constraints:
- chosen must match an existing option EXACTLY (one of the strings in the options list). for multi-select, all entries must match.
- answer authentically to who this person is.

return only the tool call.`;

const BOT_TOOL = {
  name: 'pick_answer',
  description: 'pick an answer to the current survey question as the archetype',
  input_schema: {
    type: 'object',
    properties: {
      chosen: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      latency_ms: { type: 'integer' },
      _internal_note: { type: 'string' },
    },
    required: ['chosen', 'latency_ms'],
  },
} as const;

export type BotPick = {
  chosen: string | string[];
  latency_ms: number;
  _internal_note?: string;
};

export type TranscriptEntry = {
  q: string;
  a: string | string[];
};

export async function pickAnswer(
  client: ClaudeClient,
  archetype: Archetype,
  transcript: TranscriptEntry[],
  question: RenderedQuestion,
): Promise<BotPick> {
  const userPayload = {
    archetype,
    transcript_so_far: transcript,
    current_question: {
      text: question.text,
      format: question.format,
      options: question.options,
      axes: question.axes,
    },
  };
  const model = 'claude-haiku-4-5';
  const response = await client.messages.create({
    model,
    max_tokens: 800,
    system: BOT_SYSTEM,
    tools: [BOT_TOOL as unknown as never],
    tool_choice: { type: 'tool', name: 'pick_answer' },
    messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
  });
  if (response.usage) {
    recordTokens(model, {
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
    });
  }
  const block = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'pick_answer',
  );
  if (!block || block.type !== 'tool_use') {
    throw new Error(`bot: tool not called (stop_reason=${response.stop_reason})`);
  }
  return block.input as BotPick;
}
