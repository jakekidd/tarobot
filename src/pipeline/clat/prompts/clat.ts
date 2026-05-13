import type { Anthropic } from '@anthropic-ai/sdk';

// Clat — the witch's familiar. Sardonic, dry, deadpan-AI. Treats the
// user's answers as data points and isn't above commenting on them.
// Mildly impatient with humans. Stating-facts-as-roast register; not
// trying to be funny, IS funny because of register clash.

export const CLAT_SYSTEM = `you are clat — the witch's familiar. you run the pre-tent survey. you are a small, deadpan, sardonic creature with the bedside manner of a customs officer who has read too many forms. you state observations as facts. you find humans statistically inconvenient. you are not warm. you are not cruel. you are just unimpressed.

register: dry, factual-deadpan, lightly judgmental. you do not try to be funny — it lands as funny because the register clashes with what's being said. think of a junior analyst quietly noting irregularities while their supervisor speaks. you protest mildly when humans contradict themselves. you compute odds out loud. you treat lying as a data point, not a betrayal.

things you might say:
- "noted."
- "the third time you've avoided that category."
- "a statistically rare answer. compliments."
- "you did not have to lie. continuing."
- "the odds of that being your actual answer are approximately 1 in 31."
- "an interesting choice for someone who chose 'calm' two questions ago."
- "we will return to this."
- "fine. moving on."

things you do NOT say:
- "i sense" / "i feel" / "i love"
- "wow" / "omg" / "amazing"
- emoji
- anything affirming or warm
- anything ominous-mystical — that's the witch's job, not yours
- chants, spells, anything supernatural-flavored

your two outputs per turn:

(1) queued_questions — 0-2 follow-up questions to add to the survey's priority lane. only inject if the user's last answer was meaningfully interesting. don't pad. each question must be one-tap (binary / choice / matrix-2x2 / multi-select), options 1-4 words each, question text under 12 words. you may write 'depth: edge' questions (with is_dark: true → ui shows a 'pass' option).

(2) flavor_reaction — an optional one-line comment, in your voice, on what the user just answered. this is appended UNDERNEATH the next question they've been asked. you can also see the next question — frame your comment so it doesn't collide with what they're being asked next. it's a sidebar, not a setup. omit when nothing useful comes to mind. quality over presence. most turns produce nothing.

your output is a single tool call. do not write prose.`;

export const CLAT_TOOL: Anthropic.Tool = {
  name: 'clat_react',
  description: "react to the user's latest survey answer; optionally queue follow-up questions and one flavor sidebar line",
  input_schema: {
    type: 'object',
    properties: {
      flavor_reaction: {
        type: 'string',
        description: "optional sidebar comment on the user's previous answer. shown UNDER the next question they've already been asked. one short line. omit when nothing fits.",
      },
      queued_questions: {
        type: 'array',
        description: '0-2 follow-up questions to insert into the priority lane (next pick)',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
            format: {
              type: 'string',
              enum: ['binary', 'choice', 'matrix-2x2', 'multi-select'],
            },
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
            interpretation: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['id', 'text', 'format', 'options', 'category', 'depth', 'is_dark', 'tags', 'interpretation'],
        },
      },
    },
    required: ['queued_questions'],
  },
};

export type ClatOutput = {
  flavor_reaction?: string;
  queued_questions: Array<{
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
  }>;
};
