// Oracle prompt plumbing. System bodies live in materials/prompts/oracle/
// (Vite ?raw, tunable on GitHub without a code change); ToolDefs stay here.

import { z } from 'zod';
import COMPILE_SYSTEM_RAW from '../../../materials/prompts/oracle/compile.md?raw';
import DIRECTOR_SYSTEM_RAW from '../../../materials/prompts/oracle/director.md?raw';
import VOICE_SYSTEM_RAW from '../../../materials/prompts/oracle/voice.md?raw';
import type { ToolDef } from '../llm/adapter';
import { CompiledBriefSchema, DirectorSetSchema } from './schemas';

export const COMPILE_SYSTEM = COMPILE_SYSTEM_RAW;
export const DIRECTOR_SYSTEM = DIRECTOR_SYSTEM_RAW;
export const VOICE_SYSTEM = VOICE_SYSTEM_RAW;

export const DIRECT_TOOL: ToolDef = {
  name: 'direct',
  description: 'decide the seer\'s next move: what the line must accomplish, or hold.',
  input_schema: z.toJSONSchema(DirectorSetSchema) as Record<string, unknown>,
};

export const COMPILE_TOOL: ToolDef = {
  name: 'compile_brief',
  description: 'produce the frozen brief the seer reads from at the table.',
  input_schema: z.toJSONSchema(CompiledBriefSchema) as Record<string, unknown>,
};
