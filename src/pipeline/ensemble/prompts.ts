// Ensemble prompt plumbing. System bodies live in
// materials/prompts/ensemble/ (Vite ?raw, tunable without a code
// change); ToolDefs stay here beside the schemas they mirror.

import WILDCARD_RAW from '../../../materials/prompts/ensemble/wildcard.md?raw';
import DRIVER_RAW from '../../../materials/prompts/ensemble/driver.md?raw';
import INTERPRETER_RAW from '../../../materials/prompts/ensemble/interpreter.md?raw';
import BEHOLDER_RAW from '../../../materials/prompts/ensemble/beholder.md?raw';
import ATTENTION_RAW from '../../../materials/prompts/ensemble/attention.md?raw';
import type { ToolDef } from '../llm/adapter';
import { ENSEMBLE_MOVES, STALL_KINDS } from './types';

export const SYSTEMS = {
  wildcard: WILDCARD_RAW,
  driver: DRIVER_RAW,
  interpreter: INTERPRETER_RAW,
  beholder: BEHOLDER_RAW,
  attention: ATTENTION_RAW,
} as const;

export const DRIVER_TOOL: ToolDef = {
  name: 'drive',
  description: 'decide the next action for the oracle to perform',
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

export const PERSONA_TOOL: ToolDef = {
  name: 'speak',
  description: 'write three takes; only `spoken` is performed at the table',
  input_schema: {
    type: 'object',
    properties: {
      too_safe: { type: 'string' },
      too_far: { type: 'string' },
      spoken: { type: 'string' },
    },
    required: ['too_safe', 'too_far', 'spoken'],
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

export const FACTS_TOOL: ToolDef = {
  name: 'file_facts',
  description: 'file durable from-the-mouth facts for the ledger',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        maxItems: 20,
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
    required: [],
  },
};

