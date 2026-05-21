// Crowd prompt + tool spec. Body lives in materials/prompts/crowd.md.

import { z } from 'zod';
import CROWD_SYSTEM_RAW from '../../../../../materials/prompts/crowd.md?raw';
import { CrowdOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const CROWD_SYSTEM = CROWD_SYSTEM_RAW;

export const CROWD_TOOL: ToolDef = {
  name: 'crowd_decoys',
  description: 'write 2-3 honest decoy options for a survey question — blind to the subject, blind to the planted option.',
  input_schema: z.toJSONSchema(CrowdOutputSchema) as Record<string, unknown>,
};
