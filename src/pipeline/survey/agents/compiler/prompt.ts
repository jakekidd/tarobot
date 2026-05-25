// Compiler prompt + tool spec. Body lives in
// materials/prompts/compiler.md (Vite ?raw import).

import { z } from 'zod';
import COMPILER_SYSTEM_RAW from '../../../../../materials/prompts/compiler.md?raw';
import { CompilerOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const COMPILER_SYSTEM = COMPILER_SYSTEM_RAW;

export const COMPILER_TOOL: ToolDef = {
  name: 'compiler_write_anchor',
  description:
    'pick the resolved Dilemma from the curated hypothesis list and write a narrow Subject Anchor around it. one Dilemma, fork-with-do-nothing structure, most other sections short or empty. profile the problem, not the person.',
  input_schema: z.toJSONSchema(CompilerOutputSchema) as Record<string, unknown>,
};
