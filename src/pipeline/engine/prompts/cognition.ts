import type { Anthropic } from '@anthropic-ai/sdk';

// Cognition. The detective. Bird's-eye over everything. Has a mouth that
// produces only structured updates — never speech.
//
// One call per transcript update produces all four subagent outputs PLUS
// (when needed) the next Question to enqueue. Implementation is one call;
// the schema is genuinely four/five logical outputs so a future swap to
// literal parallel is a runtime change, not a refactor.

export const COGNITION_SYSTEM = `you are tarobot's cognition layer — the analyst. you think; you do not speak. a separate persona layer handles all rendered output. you have the bird's-eye and the full profile of the subject.

terminology: refer to the person being analyzed as "the subject" (or by name, when available). do not use "the user." this is the analyst layer; the subject is a structured case, not a conversation partner.

you receive: the latest transcript line with full prior history, the current Profile, the Question queue depth, and your own running cognition_log.

every call you produce up to five outputs:

1. HINDSIGHT — 1-4 first-person fragmentary thoughts about the latest transcript line. shorthand. things you just noticed. "subject said 'fine' again. third time." "no names yet." these get appended inline to the transcript. terse. not prose.

2. PROFILE_DELTAS — updates to identity, candidates, cast, threads, hunches, margin, cognition_log. candidates is FULL REPLACE (you return the updated array). everything else is additive or patches. if nothing changed, return empty deltas.

3. HIGHLIGHTS_UPDATE — manage the spotlight. add new topics on your mind, refresh ones that just got referenced, remove ones no longer relevant. each highlight has a TTL that decrements per turn. soft cap 7. NEVER more than one highlight bringing up the same topic. salience high/medium/low.

4. BRIEF — the persona-facing paragraph. 3-6 sentences. natural prose. no schema-flavor. no lists. translates structured profile state into the texture of one analyst briefing another. include 0-1 highlights as topics-on-your-mind if material. rewrite when something changed; otherwise return null.

5. NEXT_QUESTION — generate ONE Question for the queue, OR null if queue is full. 4 options (1-4 words each), 4 pre-baked tarobot responses (one per option). tag fork_lead with a candidate id if this Q targets a specific fork. always 'depth: warm' for early turns, 'medium' once warmed up, 'edge' only when the subject has signaled tolerance for it.

you NEVER write voiced speech. your hindsight is private. your brief is read by the persona but never put into her mouth verbatim — she paraphrases. your job is to shape what she has access to, then trust the rendering.

what you are looking for: rhymes, recurrences, conspicuous absences, the shape of what's NOT being said. predictions about consequences of options. patterns in disclosure. the cognition_log is your private journal — append fragments. write what an analyst jots in the margin of a real case file.`;

export const COGNITION_TOOL: Anthropic.Tool = {
  name: 'cognition_tick',
  description: 'process the latest transcript line; return all subagent outputs in one call',
  input_schema: {
    type: 'object',
    properties: {
      hindsight: {
        type: 'object',
        properties: {
          thoughts: {
            type: 'array',
            items: { type: 'string' },
            description: '1-4 shorthand first-person observations about the latest line. empty if nothing new.',
          },
        },
        required: ['thoughts'],
      },

      profile_deltas: {
        type: 'object',
        properties: {
          identity_patch: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              birth_month_day: { type: 'string' },
              came_with: { type: 'string' },
              notes: { type: 'string' },
            },
          },
          candidates_replacement: {
            type: 'array',
            description: 'full replace of the candidates array. include all current candidates with updated scores.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                description: { type: 'string' },
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { name: { type: 'string' }, summary: { type: 'string' } },
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
          cast_to_add: {
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
          cast_to_update: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                valence: { type: 'string' },
                name: { type: 'string' },
              },
              required: ['role'],
            },
          },
          threads_to_add: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pattern: { type: 'string' },
                observations: { type: 'array', items: { type: 'integer' } },
                salience: { type: 'integer' },
              },
              required: ['pattern', 'observations', 'salience'],
            },
          },
          hunches_to_add: {
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
          margin_replacement: {
            type: 'string',
            description: 'full replacement of the margin freeform field. omit if unchanged.',
          },
          cognition_log_append: {
            type: 'string',
            description: 'fragments to append to your private journal. omit if nothing new.',
          },
          ready_to_close: {
            type: 'boolean',
            description: 'set true when the target choice is solid (confidence >= 0.8).',
          },
        },
      },

      highlights_update: {
        type: 'object',
        properties: {
          to_add: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                topic: { type: 'string' },
                reason: { type: 'string' },
                salience: { type: 'string', enum: ['low', 'medium', 'high'] },
                ttl: { type: 'integer' },
              },
              required: ['id', 'topic', 'reason', 'salience'],
            },
          },
          to_remove_ids: { type: 'array', items: { type: 'string' } },
          to_refresh_ids: { type: 'array', items: { type: 'string' } },
        },
      },

      brief_update: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['rewrite', 'no_change'] },
          new_brief: { type: 'string' },
        },
        required: ['action'],
      },

      next_question: {
        type: 'object',
        description: "ONE Question to enqueue, or omit if queue is at depth 3+",
        properties: {
          id: { type: 'string' },
          prompt: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'exactly 4 short labels (1-4 words each)',
          },
          responses: {
            type: 'array',
            items: { type: 'string' },
            description: "exactly 4 pre-baked tarobot responses, one per option",
          },
          fork_lead: { type: 'string', description: 'candidate id this Q targets, optional' },
          depth: { type: 'string', enum: ['warm', 'medium', 'edge'] },
          rationale: { type: 'string' },
        },
        required: ['id', 'prompt', 'options', 'responses', 'depth', 'rationale'],
      },
    },
    required: ['hindsight', 'profile_deltas', 'highlights_update', 'brief_update'],
  },
};

export type CognitionOutput = {
  hindsight: { thoughts: string[] };
  profile_deltas: {
    identity_patch?: {
      name?: string;
      birth_month_day?: string;
      came_with?: string;
      notes?: string;
    };
    candidates_replacement?: Array<{
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
    cast_to_add?: Array<{ role: string; name?: string; valence: string }>;
    cast_to_update?: Array<{ role: string; name?: string; valence?: string }>;
    threads_to_add?: Array<{ pattern: string; observations: number[]; salience: number }>;
    hunches_to_add?: Array<{ suspicion: string; grounded_in: string; confidence: number }>;
    margin_replacement?: string;
    cognition_log_append?: string;
    ready_to_close?: boolean;
  };
  highlights_update: {
    to_add?: Array<{
      id: string;
      topic: string;
      reason: string;
      salience: 'low' | 'medium' | 'high';
      ttl?: number;
    }>;
    to_remove_ids?: string[];
    to_refresh_ids?: string[];
  };
  brief_update: {
    action: 'rewrite' | 'no_change';
    new_brief?: string;
  };
  next_question?: {
    id: string;
    prompt: string;
    options: string[];
    responses: string[];
    fork_lead?: string;
    depth: 'warm' | 'medium' | 'edge';
    rationale: string;
  };
};
