// Ensemble prompt plumbing. System bodies live in
// materials/prompts/ensemble/ (Vite ?raw, tunable without a code
// change); ToolDefs stay here beside the schemas they mirror.

import WILDCARD_RAW from '../../../materials/prompts/ensemble/wildcard.md?raw';
import DRIVER_RAW from '../../../materials/prompts/ensemble/driver.md?raw';
import INTERPRETER_RAW from '../../../materials/prompts/ensemble/interpreter.md?raw';
import PROFILER_RAW from '../../../materials/prompts/ensemble/profiler.md?raw';
import CONJECTOR_RAW from '../../../materials/prompts/ensemble/conjector.md?raw';
import ATTENTION_RAW from '../../../materials/prompts/ensemble/attention.md?raw';
import type { ToolDef } from '../llm/adapter';
import { BEAT_TYPES, DILEMMA_CLASSES, QUESTION_FRAMES } from './beats';

export const SYSTEMS = {
  wildcard: WILDCARD_RAW,
  driver: DRIVER_RAW,
  interpreter: INTERPRETER_RAW,
  profiler: PROFILER_RAW,
  conjector: CONJECTOR_RAW,
  attention: ATTENTION_RAW,
} as const;

export const DRIVER_TOOL: ToolDef = {
  name: 'select_beat',
  description: 'select the next beat from the MENU and pass its fill material',
  input_schema: {
    type: 'object',
    properties: {
      beat: { type: 'string', enum: [...BEAT_TYPES] },
      frame: { type: 'string', enum: [...QUESTION_FRAMES] },
      target: { type: 'string' },
      variant: { type: 'string', enum: ['primary', 'fallback', 'escape'] },
      accomplish: { type: 'string' },
      ammo: { type: 'string' },
      approx_words: { type: 'integer' },
      note: { type: 'string' },
    },
    required: ['beat', 'accomplish', 'approx_words', 'note'],
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

export const FILL_TOOL: ToolDef = {
  name: 'fill_slots',
  description: 'fill the named slots of the authored skeleton, in register',
  input_schema: {
    type: 'object',
    properties: {
      fills: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['fills'],
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
      coherence: { type: 'integer', enum: [0, 1, 2, 3] },
      frame_stale: { type: 'boolean' },
    },
    required: ['expressing', 'thoughts', 'feelings', 'cue', 'coherence', 'frame_stale'],
  },
};

export const PROFILE_TOOL: ToolDef = {
  name: 'file_profile',
  description: 'update the profile and elevate the facets worth asking about',
  input_schema: {
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            facet: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['facet', 'answer'],
        },
      },
      elevate: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          properties: {
            facet: { type: 'string' },
            angle: { type: 'string' },
          },
          required: ['facet', 'angle'],
        },
      },
    },
    required: [],
  },
};

export const CONJECTOR_TOOL: ToolDef = {
  name: 'conject',
  description:
    'grade the previous guess, then: file the next guess, or classify (class + first passages), or edit one passage of the document',
  input_schema: {
    type: 'object',
    properties: {
      prev: { type: 'string', enum: ['cold', 'warm', 'hot', 'unplayed'] },
      guess: { type: 'string' },
      alt_guess: { type: 'string' },
      class: { type: 'string', enum: [...DILEMMA_CLASSES] },
      plant: { type: 'string' },
      problem_md: { type: 'string' },
      options_md: { type: 'string' },
      quest_md: { type: 'string' },
    },
    required: [],
  },
};
