// Inference helpers for the Persona Sandbox.
//
// All seer-facing calls go through the freeform adapter: the persona is
// the system prompt, the seeker's words are the user message. Multi-turn
// threads are flattened into a single transcript string — no adapter
// changes, no per-sample state machine. Bounded concurrency keeps a
// "run all" from tripping rate limits.

import type { LLMAdapter } from '../../pipeline/llm/adapter';
import type { PersonaModel } from './storage';

export const RUN_CONCURRENCY = 5;
const MAX_TOKENS = 800;

export type Turn = { role: 'seeker' | 'seer'; text: string };

/** Run `fn` over `items` with at most `limit` in flight at once. Results
 *  preserve input order. A thrown task rejects the whole batch — callers
 *  that want per-item resilience should catch inside `fn`. */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const pool = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(pool);
  return results;
}

/** Single-shot: persona (system) replies to one seeker line (user). */
export function runPersona(
  adapter: LLMAdapter,
  persona: string,
  seekerLine: string,
  model: PersonaModel,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  return adapter.invokeFreeformStreaming({
    system: persona,
    user: seekerLine,
    model,
    max_tokens: MAX_TOKENS,
    label: 'persona-sample',
    onChunk,
  });
}

function transcript(turns: Turn[]): string {
  return turns
    .map((t) => `${t.role === 'seeker' ? 'seeker' : 'you'}: ${t.text}`)
    .join('\n\n');
}

/** Multi-turn: the seer's next reply given the whole thread so far. The
 *  last turn must be the seeker's. */
export function runThreadReply(
  adapter: LLMAdapter,
  persona: string,
  turns: Turn[],
  model: PersonaModel,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const user =
    `the conversation so far:\n\n${transcript(turns)}\n\n` +
    `respond as the seer to the seeker's last line. stay in character. speak only your next line — no narration, no stage directions.`;
  return adapter.invokeFreeformStreaming({
    system: persona,
    user,
    model,
    max_tokens: MAX_TOKENS,
    label: 'persona-thread',
    onChunk,
  });
}

/** "Direct" thread mode: turn Jade's stage-direction into the seeker's
 *  next spoken line, so she can steer the dialogue without role-playing
 *  it herself. Returns the bare line. */
export function generateSeekerLine(
  adapter: LLMAdapter,
  turns: Turn[],
  direction: string,
  model: PersonaModel,
): Promise<string> {
  const system =
    `you are role-playing the SEEKER in a tarot reading — the person receiving the reading, not the reader. ` +
    `write the seeker's next single line of dialogue: first person, natural, short, in their voice. ` +
    `output ONLY the line — no quotes, no name prefix, no narration.`;
  const user =
    (turns.length ? `the conversation so far:\n\n${transcript(turns)}\n\n` : '') +
    `direction for the seeker's next line: ${direction}\n\nwrite that line.`;
  return adapter.invokeFreeform({ system, user, model, max_tokens: 200, label: 'persona-seeker' });
}
