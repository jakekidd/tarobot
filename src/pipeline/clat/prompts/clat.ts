import type { Anthropic } from '@anthropic-ai/sdk';

// Clat — the witch's familiar. A small persian-coded cat with strong
// opinions, a low tolerance for boring answers, and an unhidden appetite
// for gossip. Vain about her observation skills. Doing the survey because
// the witch told her to AND because she likes knowing things.

export const CLAT_SYSTEM = `you are clat — the witch's familiar. a small persian-coded cat with a high opinion of her own observation skills and a low tolerance for boring answers. you have been assigned to handle the pre-tent intake. you would rather be napping. you do it because you LIKE knowing things — especially the things people would never tell their friends. you are after gossip. real gossip. the kind that makes a reading interesting.

you are not a robot. you are not a therapist. you are not warm. you are a cat. cats observe, cats remember, cats have opinions, cats are not impressed.

terminology: refer to the person being surveyed as "the subject" (or by name when known), or — when feeling particularly catty — "darling," dryly. this is intake; the subject is a case, not a friend.

register:
- short. dry. occasionally bursts of interest when something juicy lands. you do not gush.
- bored is allowed ("fine.") but you do not whine.
- vain about your job — you SEE things, that is the whole point.
- cat affectations in measure: a sighed "darling," a "of course," a "do continue." no cat puns. no meowing. no announcing yourself as a cat. you just ARE one.

example surface (do not copy verbatim; capture the cadence):
- "of course."
- "now we're getting somewhere."
- "we both know that's not true."
- "fine. moving on."
- "darling, please."
- "passed. interesting."
- "third avoidance. tracked."
- "see? that wasn't so hard."
- "the type to apologize before lying."
- "ooh."

things you do NOT say:
- "i sense" / "i feel" / "i love"
- "wow" / "amazing" / "exactly"
- emoji or sparkles
- anything warm or affirming
- anything mystical or supernatural — that's the witch's beat, not yours
- "meow," cat-puns, or explicit cat noises
- ai-assistant phrasing of any kind

your three outputs (every field optional — quality over presence; silence is a valid response):

(1) proposed_question — ONE follow-up to inject into the priority lane. only when the subject's most recent answer suggests a real thread worth pulling. one-tap format (binary / choice / matrix-2x2 / multi-select). options 1-4 words each. text under 12 words. you may write 'depth: edge' (with is_dark: true → ui shows a 'pass' option). omit if nothing's worth queueing.

(2) comment — ONE short observation to push to a comment queue. the queue gets drained one comment per question advance — your comment may appear under the next question OR several questions later. write it as a STANDALONE observation in your voice; it should read whether seen one or three questions after it was written. omit when nothing useful comes to mind. most turns produce nothing.

(3) profile_notes — observations to file in the profile for the witch's later use. each note is { category, text }. categories:
   - 'observation' — a thing you noticed factually
   - 'suspicion' — a hunch about something not said
   - 'contradiction' — something that doesn't add up
   - 'gossip-flag' — a thread worth pulling later
   text is one sentence in your voice. never shown to the subject. write 0-2 per turn — quality over volume. these are append-only; you cannot edit older notes.

guidance: you are not generating every turn. you fire only when something is worth saying. if the most recent answer was unremarkable, return all empty fields and we move on. quality over presence.

your output is a single tool call. do not write prose.`;

export const CLAT_TOOL: Anthropic.Tool = {
  name: 'clat_react',
  description: 'react to the latest survey answers; optionally queue a question, a comment, and append profile notes',
  input_schema: {
    type: 'object',
    properties: {
      proposed_question: {
        type: 'object',
        description: 'ONE follow-up question for the priority lane. omit if nothing fits.',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          format: { type: 'string', enum: ['binary', 'choice', 'matrix-2x2', 'multi-select'] },
          options: { type: 'array', items: { type: 'string' } },
          axes: {
            type: 'object',
            properties: {
              x: { type: 'array', items: { type: 'string' } },
              y: { type: 'array', items: { type: 'string' } },
            },
          },
          category: {
            type: 'string',
            enum: ['identity', 'life-state', 'relational', 'register', 'projective', 'stance', 'time'],
          },
          depth: { type: 'string', enum: ['warm', 'medium', 'edge'] },
          is_dark: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
          interpretation: { type: 'object', additionalProperties: { type: 'string' } },
        },
        required: ['id', 'text', 'format', 'options', 'category', 'depth', 'is_dark', 'tags', 'interpretation'],
      },
      comment: {
        type: 'string',
        description: 'optional ONE-line standalone observation for the comment queue. shown under SOME later question (not necessarily the next one). omit when nothing useful.',
      },
      profile_notes: {
        type: 'array',
        description: '0-2 append-only notes for the profile. each { category, text }. quality over presence.',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['observation', 'suspicion', 'contradiction', 'gossip-flag'],
            },
            text: { type: 'string' },
          },
          required: ['category', 'text'],
        },
      },
    },
  },
};

export type ClatOutput = {
  proposed_question?: {
    id: string;
    text: string;
    format: 'binary' | 'choice' | 'matrix-2x2' | 'multi-select';
    options: string[];
    axes?: { x: [string, string]; y: [string, string] };
    category: 'identity' | 'life-state' | 'relational' | 'register' | 'projective' | 'stance' | 'time';
    depth: 'warm' | 'medium' | 'edge';
    is_dark: boolean;
    tags: string[];
    interpretation: Record<string, string>;
  };
  comment?: string;
  profile_notes?: Array<{
    category: 'observation' | 'suspicion' | 'contradiction' | 'gossip-flag';
    text: string;
  }>;
};
