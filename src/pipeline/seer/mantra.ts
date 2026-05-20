// Closing mantra agent. Fires after the 4th card flip, between the
// closing director and the actor's outro. Produces a single short
// declarative line — the lens the user carries out of the tent.
// Designed to be ticker-tape-printable: no markdown, no emoji, no
// formatting characters.
//
// Output is stored on ClosingIntent.mantra (typed) and rendered in
// Reading.tsx after the actor's outro completes.

import type { LLMAdapter } from '../llm/adapter';
import type { Profile } from '../types';
import type { StoryObject } from '../survey';
import type { ChatMessage, RevealedSlot } from './types';
import MANTRA_SYSTEM_RAW from '../../../materials/prompts/mantra.md?raw';

export const MANTRA_SYSTEM = MANTRA_SYSTEM_RAW;

export type MantraInput = {
  profile: Profile;
  story?: StoryObject | null;
  intention: string;
  revealed: RevealedSlot[];
  chat: ChatMessage[];
  /** The closing director's structural takeaway. The mantra is a
   *  tighter, more portable form of it — same shape, smaller form. */
  closing_takeaway: string;
};

/** Produce the closing mantra. Returns a sanitized one-line string
 *  (no markdown, no emoji, no surrounding quotes). Returns empty
 *  string on adapter failure — the caller treats null/empty as
 *  "no mantra this reading" and the UI just doesn't render it. */
export async function generateMantra(
  adapter: LLMAdapter,
  input: MantraInput,
): Promise<string> {
  const payload = {
    name: input.profile.identity?.name ?? 'the user',
    profile_identity: input.profile.identity,
    cast: input.profile.cast,
    intention: input.intention,
    story: input.story ?? null,
    closing_takeaway: input.closing_takeaway,
    transcript: {
      beats: input.revealed.map((r) => ({
        position_id: r.position_id,
        card: r.card_id,
        beat: r.monologue.text,
      })),
      chat: input.chat,
    },
    instruction: 'one sentence, lowercase, no markdown, no emoji, <100 chars. return only the mantra text.',
  };

  try {
    const raw = await adapter.invokeFreeform({
      system: MANTRA_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      model: 'cognition',
      max_tokens: 120,
    });
    return sanitizeMantra(raw);
  } catch (e) {
    console.warn('[seer] mantra generation failed', e);
    return '';
  }
}

/** Strip markdown markers, emoji, surrounding quotes, newlines. Returns
 *  empty string when the result is unusable. */
export function sanitizeMantra(raw: string): string {
  let s = raw.trim();
  // Strip surrounding double or single quotes if the model added them.
  s = s.replace(/^["'`](.*)["'`]$/s, '$1').trim();
  // Strip leading "mantra:" / "the mantra is" preambles.
  s = s.replace(/^(mantra|the mantra is|here is the mantra|reading mantra)\s*[:—-]?\s*/i, '');
  // Collapse internal newlines into spaces, then trim again.
  s = s.replace(/\s*\n\s*/g, ' ').trim();
  // Strip markdown asterisks and underscores (emphasis markers).
  s = s.replace(/[*_]+/g, '');
  // Strip emoji (broad unicode range — keeps em-dashes and standard
  // punctuation).
  s = s.replace(/\p{Extended_Pictographic}/gu, '');
  s = s.trim();
  // Hard cap at 120 chars (the prompt asks for ≤100; cap defensively).
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s;
}
