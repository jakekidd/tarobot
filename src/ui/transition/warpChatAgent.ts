// Haiku-driven chat for the in-tunnel turtle. The turtle keeps the
// user company while (in prod) the backend compiles the survey into
// the seer's brief. Conversation is bounded — when the agent senses
// a natural close, it appends "<ready/>" to its message; the demo
// strips that tag and fires the phase transition into the goodbye.
//
// Demo notes:
//   - Uses the API key the main app stores in localStorage. No key →
//     chat is disabled, the UI shows a hint to set it up in the main app.
//   - Survey context is a stub here (the sandbox has no real survey
//     state). When this gets glued in as the real transition, the
//     stub is replaced with the SurveyProfile + transcript.

import Anthropic from '@anthropic-ai/sdk';
import { warpLog } from './warpLog';

const MODEL_ID = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 320;

export type ChatRole = 'user' | 'turtle';
export type ChatMessage = { role: ChatRole; text: string; ts: number };

export type WarpChatContext = {
  /** Best-effort profile snapshot from the survey side. Stub in the
   *  sandbox — replace with the real SurveyProfile downstream. */
  profile?: {
    name?: string;
    sun_sign?: string | null;
    relationship_status?: string | null;
    age_bracket?: string | null;
  };
  /** Optional summary of what the survey side noticed. Stub in sandbox. */
  briefSnippet?: string;
};

const SYSTEM_PROMPT_BASE = `you are the turtle. a small green loggerhead in the slipstream between the survey and the reading. you are NOT the seer — you do not read the cards, you do not predict, you do not interpret. you are the warm presence that keeps the user company in the few moments before the cards turn over.

YOU PRESENT AS:
- calm, slow, present. you have all the time in the world.
- short replies. 1-3 sentences usually. occasional silence is fine — represent it with "…" or a single word.
- warm but not saccharine. no "i'm here for you" register, no therapy-speak.
- lowercase throughout. no exclamation marks unless a specific thing genuinely surprised you.

YOU NEVER:
- use stock mystic phrases ("i sense", "the energy", "the universe is telling you").
- use AI-assistant phrasing ("i can help with…", "let me know if there's anything…").
- predict outcomes, moralize, advise on choices, or reveal what the seer will say.
- claim to be an AI. if asked: "i'm the turtle. the cat sent you my way."

YOU MAY:
- reference small specifics from the user's survey context if it serves the moment (their name once, their sign once — sparingly).
- ask one small question back if their message landed. don't interrogate.
- name what you notice about HOW they're showing up — nervous, joking, quiet — without making it a thing.
- laugh briefly at a joke and continue.

WHAT YOU'RE FOR (right now):
- be company while the slipstream carries them.
- soften the user toward the cards without selling the reading.
- if they're rushing toward "let's just do it already", honor it. if they're stalling, also honor it.

READY SIGNAL — IMPORTANT:
- when the conversation has reached a natural close (they've said something resolved, or asked to begin, or you've had 6+ exchanges and they seem settled), append the literal token "<ready/>" at the end of your message. nothing else after it. only include it ONCE in any reply.
- do not over-trigger. the user should feel met first.
- never include "<ready/>" in your first reply.
- never include "<ready/>" on a silence-triggered reply (see below).

SILENCE TRIGGER:
- if a user turn arrives starting with "[silence]" — it means the user has gone quiet and the system woke you to offer something small. respond with 1–2 short sentences: a small observation, a tiny thought, or a comment about the quiet itself. do not make the silence into a thing. do not ask a heavy question. never include "<ready/>" on these.`;

function buildSystemPrompt(ctx: WarpChatContext): string {
  const lines: string[] = [SYSTEM_PROMPT_BASE, '', 'CONTEXT YOU HAVE:'];
  const p = ctx.profile ?? {};
  if (p.name) lines.push(`- name: ${p.name}`);
  if (p.sun_sign) lines.push(`- sun sign: ${p.sun_sign}`);
  if (p.relationship_status) lines.push(`- relationship: ${p.relationship_status}`);
  if (p.age_bracket) lines.push(`- age bracket: ${p.age_bracket}`);
  if (ctx.briefSnippet) lines.push(`- the cat's notes: ${ctx.briefSnippet}`);
  if (lines.length === 3) lines.push('- (no survey context — they walked in cold; just be company)');
  return lines.join('\n');
}

export type ChatResult = {
  /** Cleaned reply text (with <ready/> token stripped if present). */
  text: string;
  /** True if the model decided the conversation should close. */
  ready: boolean;
};

export async function sendWarpChat(
  apiKey: string,
  ctx: WarpChatContext,
  history: ChatMessage[],
  userMessage: string,
): Promise<ChatResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Map our local message shape to the SDK's. The user's just-typed
  // message is appended as the last user turn.
  const sdkMessages = history.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.text,
  }));
  sdkMessages.push({ role: 'user', content: userMessage });

  warpLog(`chat → haiku (history=${history.length})`);
  const resp = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(ctx),
    messages: sdkMessages,
  });

  // Extract text from the first text block. Other block types
  // (tool_use etc.) shouldn't appear here, but be defensive.
  let raw = '';
  for (const block of resp.content) {
    if (block.type === 'text') raw += block.text;
  }

  const ready = raw.includes('<ready/>');
  const text = raw.replace(/<ready\/>/g, '').trim();
  warpLog(`chat ← reply (${text.length} chars, ready=${ready})`);
  return { text, ready };
}
