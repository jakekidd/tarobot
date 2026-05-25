// Profiler prompt + tool spec. v3.2 hypothesis curator.
// Body lives in materials/prompts/profiler.md (Vite ?raw import).

import { z } from 'zod';
import PROFILER_SYSTEM_RAW from '../../../../../materials/prompts/profiler.md?raw';
import { ProfilerOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const PROFILER_SYSTEM = PROFILER_SYSTEM_RAW;

export const PROFILER_TOOL: ToolDef = {
  name: 'profiler_curate_hypotheses',
  description:
    'curate the working hypothesis list. add new candidates, promote what survived a test, refine with corrections, refute the dead, drop the stale. never write prose; never compose the final profile.',
  input_schema: z.toJSONSchema(ProfilerOutputSchema) as Record<string, unknown>,
};
