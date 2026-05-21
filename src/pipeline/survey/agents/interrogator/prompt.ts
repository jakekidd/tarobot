// Interrogator prompt + tool spec. Body lives in materials/prompts/interrogator.md.

import { z } from 'zod';
import INTERROGATOR_SYSTEM_RAW from '../../../../../materials/prompts/interrogator.md?raw';
import { InterrogatorOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const INTERROGATOR_SYSTEM = INTERROGATOR_SYSTEM_RAW;

export const INTERROGATOR_TOOL: ToolDef = {
  name: 'interrogator_phrase',
  description: 'write a single survey question stem from a detective-supplied intent + sample-question phrasing scaffold.',
  input_schema: z.toJSONSchema(InterrogatorOutputSchema) as Record<string, unknown>,
};
