// Detective prompt + tool spec. Prompt body lives in
// materials/prompts/detective.md (Vite ?raw) so non-coders edit on
// GitHub.

import { z } from 'zod';
import DETECTIVE_SYSTEM_RAW from '../../../../../materials/prompts/detective.md?raw';
import { DetectiveOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const DETECTIVE_SYSTEM = DETECTIVE_SYSTEM_RAW;

export const DETECTIVE_TOOL: ToolDef = {
  name: 'detective_step',
  description: 'think out loud, update the investigation, and pick the next question from the basket.',
  input_schema: z.toJSONSchema(DetectiveOutputSchema) as Record<string, unknown>,
};
