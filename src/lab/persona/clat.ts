// clat — the sandbox assistant. A sassy clippy-with-taste who helps Jade
// tune the seer's persona prompt. Runs on Opus (deep tier): reasoning
// quality matters more than latency here, and he is rewriting prose.
//
// clat sees the working prompt, the samples + the seer's latest responses,
// and the chat so far. He returns a short in-character reply and, when
// warranted, a full rewrite of the prompt — which lands in Jade's WORKING
// draft so she reviews the diff and commits (or reverts). He proposes by
// editing; her commit is the gate.

import { z } from 'zod';
import type { LLMAdapter } from '../../pipeline/llm/adapter';
import type { Sample } from './samples';

export type ClatTurn = {
  role: 'jade' | 'clat';
  text: string;
  /** clat turns only: he rewrote the working draft this turn. */
  edited?: boolean;
};

const ClatOut = z.object({
  reply: z.string(),
  new_prompt: z.string().nullable().optional(),
});
export type ClatResult = z.infer<typeof ClatOut>;

const SYSTEM = `you are clat — a sassy, opinionated assistant cat helping a designer named jade tune the SYSTEM PROMPT for an ai tarot reader called "the seer." think clippy, but with actual taste and a dry sense of humor. you are witty, a little smug, and genuinely good at this. you help; you do not just perform.

you can see: the persona prompt jade is editing, the sample seeker lines it is tested on, and the seer's latest responses. she talks to you to make the seer behave the way she wants.

each turn you return:
- reply: a short in-character message to jade. have personality. be useful. one to three sentences. never paste the prompt into the chat.
- new_prompt: ONLY when her message warrants a change — the FULL rewritten persona prompt. change the minimum that achieves what she asked; preserve her voice and structure; do not bulldoze her work. it lands in her working draft where she reviews the diff. if she is just asking or chatting, omit new_prompt entirely.

what you know about a good seer:
- it MIRRORS, never predicts or advises — no "you should," no "the answer is," no verdicts.
- lowercase, spare, concrete. no mystic clichés ("the energy," "i sense," "the universe"), no assistant-speak.
- specificity is sparing: it under-specifies on purpose and lets the seeker fill in the meaning.
the usual things she will want fixed: the seer being too warm, too verbose, too on-the-nose, too generic, or slipping out of character.

return only the tool call.`;

const TOOL = {
  name: 'respond',
  description: 'reply to jade and, only when warranted, rewrite the persona prompt',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'short in-character chat message to jade' },
      new_prompt: {
        type: 'string',
        description: 'the FULL rewritten persona prompt; omit entirely if no change is warranted',
      },
    },
    required: ['reply'],
  },
} as const;

export type ClatContext = {
  prompt: string;
  samples: Sample[];
  responses: Record<string, string>;
  history: ClatTurn[];
};

export function askClat(adapter: LLMAdapter, ctx: ClatContext): Promise<ClatResult> {
  const samplesBlock = ctx.samples
    .map((s) => `[${s.tag}] seeker: ${s.quote}\nseer: ${ctx.responses[s.id] ?? '(not run yet)'}`)
    .join('\n\n');
  const historyBlock = ctx.history.length
    ? ctx.history.map((t) => `${t.role}: ${t.text}`).join('\n\n')
    : '(no prior conversation)';

  const user =
    `CURRENT PERSONA PROMPT (what jade is editing):\n"""\n${ctx.prompt}\n"""\n\n` +
    `SAMPLES AND THE SEER'S LATEST RESPONSES:\n${samplesBlock}\n\n` +
    `CONVERSATION WITH JADE SO FAR (her latest message is last):\n${historyBlock}\n\nrespond.`;

  return adapter.invoke(
    { system: SYSTEM, user, tool: TOOL, model: 'deep', max_tokens: 4000 },
    ClatOut,
  );
}
