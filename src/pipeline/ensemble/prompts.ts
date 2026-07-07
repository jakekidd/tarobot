// Ensemble prompt plumbing. System bodies live in
// materials/prompts/ensemble/ (Vite ?raw, tunable without a code
// change); ToolDefs stay here beside the schemas they mirror.

import WILDCARD_RAW from '../../../materials/prompts/ensemble/wildcard.md?raw';
import DRIVER_RAW from '../../../materials/prompts/ensemble/driver.md?raw';
import INTERPRETER_RAW from '../../../materials/prompts/ensemble/interpreter.md?raw';
import PSYCHIC_RAW from '../../../materials/prompts/ensemble/psychic.md?raw';
import DETECTIVE_RAW from '../../../materials/prompts/ensemble/detective.md?raw';
import BEHOLDER_RAW from '../../../materials/prompts/ensemble/beholder.md?raw';
import JOKER_RAW from '../../../materials/prompts/ensemble/joker.md?raw';
import CASSANDRA_RAW from '../../../materials/prompts/ensemble/cassandra.md?raw';
import JUDGE_RAW from '../../../materials/prompts/ensemble/judge.md?raw';
import ATTENTION_RAW from '../../../materials/prompts/ensemble/attention.md?raw';
import type { ToolDef } from '../llm/adapter';
import { ENSEMBLE_MOVES, STALL_KINDS } from './types';

export const SYSTEMS = {
  wildcard: WILDCARD_RAW,
  driver: DRIVER_RAW,
  interpreter: INTERPRETER_RAW,
  psychic: PSYCHIC_RAW,
  detective: DETECTIVE_RAW,
  beholder: BEHOLDER_RAW,
  joker: JOKER_RAW,
  cassandra: CASSANDRA_RAW,
  judge: JUDGE_RAW,
  attention: ATTENTION_RAW,
} as const;

export const DRIVER_TOOL: ToolDef = {
  name: 'drive',
  description: 'decide the next action for the seer to perform',
  input_schema: {
    type: 'object',
    properties: {
      move: { type: 'string', enum: [...ENSEMBLE_MOVES] },
      thread: { type: 'string' },
      accomplish: { type: 'string' },
      ammo: { type: 'string' },
      approx_words: { type: 'integer' },
      note: { type: 'string' },
      stall_kind: { type: 'string', enum: [...STALL_KINDS] },
    },
    required: ['move', 'thread', 'accomplish', 'approx_words', 'note'],
  },
};

export const READ_TOOL: ToolDef = {
  name: 'file_read',
  description: 'file one read of what the visitor is doing under the words',
  input_schema: {
    type: 'object',
    properties: {
      expressing: { type: 'string' },
      thoughts: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      feelings: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            emotion: { type: 'string' },
            toward: { type: 'string' },
            because: { type: 'string' },
          },
          required: ['emotion', 'because'],
        },
      },
      behavior: { type: 'string' },
      cue: { type: 'string', enum: ['press', 'bank', 'honor', 'none'] },
      frame_stale: { type: 'boolean' },
    },
    required: ['expressing', 'thoughts', 'feelings', 'cue', 'frame_stale'],
  },
};

export const THOUGHTS_TOOL: ToolDef = {
  name: 'file_thoughts',
  description: "file present-tense guesses at the visitor's inner monologue",
  input_schema: {
    type: 'object',
    properties: {
      thoughts: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            thought: { type: 'string' },
            confidence: { type: 'integer', enum: [1, 2, 3] },
            refreshes: { type: 'string' },
          },
          required: ['thought', 'confidence'],
        },
      },
    },
    required: ['thoughts'],
  },
};

export const QUESTIONS_TOOL: ToolDef = {
  name: 'file_questions',
  description: 'maintain the open-question set',
  input_schema: {
    type: 'object',
    properties: {
      open: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            refreshes: { type: 'string' },
          },
          required: ['question'],
        },
      },
      answered: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['question', 'answer'],
        },
      },
    },
    required: ['open', 'answered'],
  },
};

export const FACTS_TOOL: ToolDef = {
  name: 'file_facts',
  description: 'file durable from-the-mouth facts for the ledger',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['person', 'event', 'state'] },
            label: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['kind', 'label', 'note'],
        },
      },
    },
    required: ['facts'],
  },
};

export const BIT_TOOL: ToolDef = {
  name: 'file_bit',
  description: 'file zero or one joke setup for the seer to maybe play',
  input_schema: {
    type: 'object',
    properties: {
      bit: {
        type: ['object', 'null'],
        properties: {
          setup: { type: 'string' },
          play_when: { type: 'string' },
        },
        required: ['setup', 'play_when'],
      },
    },
    required: ['bit'],
  },
};

export const PREDICTION_TOOL: ToolDef = {
  name: 'file_prediction',
  description: "predict the visitor's next utterance",
  input_schema: {
    type: 'object',
    properties: {
      gist: { type: 'string' },
      opening: { type: 'string' },
      confidence: { type: 'integer', enum: [1, 2, 3] },
    },
    required: ['gist', 'confidence'],
  },
};

export const VERDICT_TOOL: ToolDef = {
  name: 'grade',
  description: 'grade a prediction against what actually happened',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['hit', 'graze', 'miss'] },
    },
    required: ['verdict'],
  },
};
