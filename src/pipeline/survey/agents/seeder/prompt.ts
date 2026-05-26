// Seeder prompt + tool spec. Body lives in materials/prompts/seeder.md
// (Vite ?raw import) so non-coders can edit on GitHub and Vercel
// rebuilds with the new content.

import { z } from 'zod';
import SEEDER_SYSTEM_RAW from '../../../../../materials/prompts/seeder.md?raw';
import { SeederOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const SEEDER_SYSTEM = SEEDER_SYSTEM_RAW;

export const SEEDER_TOOL: ToolDef = {
  name: 'seeder_note',
  description:
    'read the latest answer in context and emit 0-6 free-form notes that seed ideas into the detective\'s mind. plain text lines. no hypotheses, no status tags, no formatting.',
  input_schema: z.toJSONSchema(SeederOutputSchema) as Record<string, unknown>,
};
