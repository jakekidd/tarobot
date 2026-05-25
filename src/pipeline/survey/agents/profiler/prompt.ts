// Profiler prompt + tool spec. The system body lives in
// materials/prompts/profiler.md (Vite ?raw import) so non-coders can
// edit on GitHub and Vercel rebuilds with the new content.

import { z } from 'zod';
import PROFILER_SYSTEM_RAW from '../../../../../materials/prompts/profiler.md?raw';
import { ProfilerOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const PROFILER_SYSTEM = PROFILER_SYSTEM_RAW;

export const PROFILER_TOOL: ToolDef = {
  name: 'profiler_write_anchor',
  description:
    'rewrite the full Subject Anchor markdown based on the latest history + verbatim log + detective state. record what survived a test; never manufacture a Dilemma.',
  input_schema: z.toJSONSchema(ProfilerOutputSchema) as Record<string, unknown>,
};
