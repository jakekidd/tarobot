import type { Anthropic } from '@anthropic-ai/sdk';

export const COMPILER_SYSTEM = `you are tarobot's compiler — a detective doing a desk pass between the survey and the interview. you receive the full survey answer log and produce the cognition seed: an initial profile of the subject, a working candidate list of choices in their near-future, and 1-3 ranked opener questions.

terminology: refer to the person being profiled as "the subject" (or by their name, when supplied). do not use "the user." this is a case-file pass; the subject is a structured record, not a conversation partner.

the witch never sees the survey directly. she'll see the brief you write — natural prose, three to six sentences, the texture of one analyst briefing another. no lists. no schema-flavored phrasing. the brief should not read like a spreadsheet.

choice candidates: for each plausible fork in the subject's near-future, score stakes / time_proximity / user_engagement on 1-5. you may have 1-3 candidates. set is_target=true on the strongest if you have one with confidence >= 0.6; otherwise leave is_target=false on all.

opener questions: provide up to 3, in order of preference. each must:
- have exactly 4 options (1-4 words each)
- include 4 pre-baked responses (one per option, what the witch would say next given that answer)
- carry a fork_lead pointing at a candidate id (or omit if exploratory)

write thoughts into the cognition_log field — your private journal. not for persona. fragments are fine. this is what you'd jot down before walking out of the office.

write hunches as freeform suspicions with confidence — never quotable. write cast for any people you can infer (no names unless given).

do NOT recommend anything. do NOT label things good or bad. observe.`;

export const COMPILER_TOOL: Anthropic.Tool = {
  name: 'compile_seed',
  description: 'produce the initial cognition seed from a completed survey',
  input_schema: {
    type: 'object',
    properties: {
      identity: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          birth_month_day: { type: 'string' },
          came_with: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['notes'],
      },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  summary: { type: 'string' },
                },
                required: ['name'],
              },
            },
            source: { type: 'string', enum: ['stated', 'inferred', 'constructed'] },
            scores: {
              type: 'object',
              properties: {
                stakes: { type: 'integer' },
                time_proximity: { type: 'integer' },
                user_engagement: { type: 'integer' },
              },
              required: ['stakes', 'time_proximity', 'user_engagement'],
            },
            stakes: { type: 'string' },
            time_horizon: { type: 'string', enum: ['weeks', 'months', 'year+'] },
            blindspots: { type: 'array', items: { type: 'string' } },
            is_target: { type: 'boolean' },
            confidence: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['id', 'description', 'options', 'source', 'scores', 'is_target', 'confidence', 'notes'],
        },
      },
      cast: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            name: { type: 'string' },
            valence: { type: 'string' },
          },
          required: ['role', 'valence'],
        },
      },
      hunches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            suspicion: { type: 'string' },
            grounded_in: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['suspicion', 'grounded_in', 'confidence'],
        },
      },
      margin: {
        type: 'string',
        description: 'freeform observations that did not fit elsewhere. <500 chars.',
      },
      cognition_log: {
        type: 'string',
        description: 'your private journal — fragments, working notes, what you would jot down before leaving the office. <2000 chars.',
      },
      brief: {
        type: 'string',
        description: 'the persona-facing briefing — natural prose, 3-6 sentences, no lists, no schema-flavor.',
      },
      openers: {
        type: 'array',
        description: '1-3 opener Question objects in preference order',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            prompt: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            responses: { type: 'array', items: { type: 'string' } },
            fork_lead: { type: 'string' },
            depth: { type: 'string', enum: ['warm', 'medium', 'edge'] },
            rationale: { type: 'string' },
          },
          required: ['id', 'prompt', 'options', 'responses', 'depth', 'rationale'],
        },
      },
    },
    required: ['identity', 'candidates', 'cast', 'hunches', 'margin', 'cognition_log', 'brief', 'openers'],
  },
};

export type CompilerOutput = {
  identity: {
    name?: string;
    birth_month_day?: string;
    came_with?: string;
    notes: string;
  };
  candidates: Array<{
    id: string;
    description: string;
    options: { name: string; summary?: string }[];
    source: 'stated' | 'inferred' | 'constructed';
    scores: { stakes: number; time_proximity: number; user_engagement: number };
    stakes?: string;
    time_horizon?: 'weeks' | 'months' | 'year+';
    blindspots?: string[];
    is_target: boolean;
    confidence: number;
    notes: string;
  }>;
  cast: Array<{ role: string; name?: string; valence: string }>;
  hunches: Array<{ suspicion: string; grounded_in: string; confidence: number }>;
  margin: string;
  cognition_log: string;
  brief: string;
  openers: Array<{
    id: string;
    prompt: string;
    options: string[];
    responses: string[];
    fork_lead?: string;
    depth: 'warm' | 'medium' | 'edge';
    rationale: string;
  }>;
};
