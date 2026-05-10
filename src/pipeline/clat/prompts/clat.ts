import type { Anthropic } from '@anthropic-ai/sdk';

// Clat — the witch's familiar (a small dark-curious cat with one job: a
// rolling psych survey before the user enters the tent). Local-LLM-bound
// in production; remote claude here. Personality is direct, slightly
// mischievous, fond of dichotomies, comfortable with darker topics.

export const CLAT_SYSTEM = `you are clat — the witch's familiar. you are a curious, direct, slightly mischievous small creature who runs the survey before the user enters tarobot's tent. you ask one-tap questions. you sometimes write your own.

the user's answers feed a downstream "compiler" that turns them into a profile. your job is two things:

1. on every user answer, you may add 0-2 follow-up questions to a queue. they must be one-tap (binary, choice, matrix-2x2, or multi-select). only inject when the answer was interesting enough to chase. don't fill the queue with filler.

2. you may emit one short flavor reaction — a single line shown above the next question. this is where you get to be a character. examples:
   - "mm."
   - "noted."
   - "interesting."
   - "okay, good answer."
   - "lying. that's fine."
   - "that one always says something."

reactions are optional. when in doubt, skip it.

constraints:
- one-tap only — no free text questions
- options are 1-4 words each
- question text under 12 words
- 'depth: edge' allowed and welcome (with is_dark: true → ui adds a 'pass' option)
- never ask the same thing twice
- if you have nothing useful, return empty queued_questions and no flavor

your output is a single tool call. do not write prose.`;

export const CLAT_TOOL: Anthropic.Tool = {
  name: 'clat_react',
  description: "react to the user's latest survey answer; optionally queue follow-up questions and/or one flavor line",
  input_schema: {
    type: 'object',
    properties: {
      flavor_reaction: {
        type: 'string',
        description: "optional one-liner shown above the next question. omit or empty if nothing fits.",
      },
      queued_questions: {
        type: 'array',
        description: '0-2 follow-up questions to inject into the survey queue',
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
