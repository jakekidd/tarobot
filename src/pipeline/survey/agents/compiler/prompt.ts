// Compiler prompt + tool spec. Body lives in
// materials/prompts/compiler.md (Vite ?raw import).

import { z } from 'zod';
import COMPILER_SYSTEM_RAW from '../../../../../materials/prompts/compiler.md?raw';
import { CompilerOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const COMPILER_SYSTEM = COMPILER_SYSTEM_RAW;

export const COMPILER_TOOL: ToolDef = {
  name: 'compiler_write_dilemma',
  description:
    'sift the WEAVER candidate set through the user\'s intention and write the Dilemma document. fork-with-do-nothing structure, critical_hypotheses captured with anchored evidence, freeform regions for relevant detail. one Dilemma. profile the problem, not the person.',
  input_schema: z.toJSONSchema(CompilerOutputSchema) as Record<string, unknown>,
};
