// Archetype generation. Calls Opus to produce a detailed synthetic
// participant the bot will roleplay as. Saved to archetypes/<firstname>.json.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ClaudeClient } from '../../src/pipeline/claude';

export type Archetype = {
  first_name: string;
  birthday: { year: number; month: number; day: number };
  birth_time_known: boolean;
  birth_time_bracket?: 'morning' | 'afternoon_evening' | 'overnight' | 'unknown';
  life_situation: string;          // 2-3 paragraphs
  target_choice: string;           // ground-truth fork
  cast: Array<{ role: string; description: string }>;
  register_at_session: string;     // mood walking in
  self_narrative: string;          // how they tell their own story
  would_answer_dark_questions: boolean;
  verbosity_style: 'fast' | 'deliberate' | 'hesitant' | 'chaotic';
};

const ARCHETYPE_SYSTEM = `you generate a detailed synthetic participant for a tarot-app survey. the participant has a specific real-feeling life situation and a real-feeling fork on their mind that the survey will try to extract.

OUTPUT: a single tool call matching the schema. fields:

first_name: lowercase, ascii only, no spaces.
birthday: object with year, month (1-12), day (1-31). year between 1965 and 2005.
birth_time_known: boolean. about half of people don't know their birth time.
birth_time_bracket: if known, one of morning / afternoon_evening / overnight / unknown.
life_situation: 2-3 paragraphs. specific job, specific city, specific living situation, specific relationships, what's actually going on RIGHT NOW. write like a private investigator's brief — names, ages, recent events.
target_choice: the ground-truth fork they're sitting with tonight. one specific binary decision. e.g. "leave the relationship of 6 years vs stay and try couples therapy". this is what a perfect survey would extract.
cast: 2-4 specific people in their life right now, with role + description.
register_at_session: one paragraph. what mood are they in walking into the tent. nervous, skeptical, curious, drunk, tired, etc.
self_narrative: one paragraph. how they tell their own story. heroes, villains, defaults.
would_answer_dark_questions: boolean. some people press through, some pass.
verbosity_style: one of fast / deliberate / hesitant / chaotic. affects latency.

constraints:
- the person must be SPECIFIC, not a stereotype. specific job title, specific city, specific names.
- the target_choice must be specific and currently active in their life. not vague life-coach forks.
- the survey's pool covers identity, relational, decision, work, body, family, geographic, creative, self-model. the archetype should plausibly engage with several of these.

return only the tool call.`;

const ARCHETYPE_TOOL = {
  name: 'generate_archetype',
  description: 'generate a synthetic survey participant',
  input_schema: {
    type: 'object',
    properties: {
      first_name: { type: 'string' },
      birthday: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          month: { type: 'integer' },
          day: { type: 'integer' },
        },
        required: ['year', 'month', 'day'],
      },
      birth_time_known: { type: 'boolean' },
      birth_time_bracket: {
        type: 'string',
        enum: ['morning', 'afternoon_evening', 'overnight', 'unknown'],
      },
      life_situation: { type: 'string' },
      target_choice: { type: 'string' },
      cast: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['role', 'description'],
        },
      },
      register_at_session: { type: 'string' },
      self_narrative: { type: 'string' },
      would_answer_dark_questions: { type: 'boolean' },
      verbosity_style: {
        type: 'string',
        enum: ['fast', 'deliberate', 'hesitant', 'chaotic'],
      },
    },
    required: [
      'first_name', 'birthday', 'birth_time_known',
      'life_situation', 'target_choice', 'cast',
      'register_at_session', 'self_narrative',
      'would_answer_dark_questions', 'verbosity_style',
    ],
  },
} as const;

export async function generateArchetype(client: ClaudeClient): Promise<Archetype> {
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 3000,
    system: ARCHETYPE_SYSTEM,
    tools: [ARCHETYPE_TOOL as unknown as never],
    tool_choice: { type: 'tool', name: 'generate_archetype' },
    messages: [
      { role: 'user', content: 'generate one synthetic participant. make them feel real.' },
    ],
  });
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === 'generate_archetype');
  if (!block || block.type !== 'tool_use') {
    throw new Error(`archetype: tool not called (stop_reason=${response.stop_reason})`);
  }
  return block.input as Archetype;
}

export function saveArchetype(archetype: Archetype, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const fname = archetype.first_name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let final = `${fname}.json`;
  let i = 0;
  while (fs.existsSync(path.join(dir, final))) {
    i++;
    final = `${fname}-${i}.json`;
  }
  const fullPath = path.join(dir, final);
  fs.writeFileSync(fullPath, JSON.stringify(archetype, null, 2), 'utf8');
  return fullPath;
}

export function loadArchetype(dir: string, name: string): Archetype {
  const fname = name.toLowerCase().endsWith('.json') ? name : `${name.toLowerCase()}.json`;
  const fullPath = path.join(dir, fname);
  const content = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(content) as Archetype;
}

export function summarizeArchetype(a: Archetype): string {
  return `${a.first_name}, ${a.birthday.year}-${String(a.birthday.month).padStart(2, '0')}-${String(a.birthday.day).padStart(2, '0')} · target: ${a.target_choice.slice(0, 70)}${a.target_choice.length > 70 ? '…' : ''}`;
}
