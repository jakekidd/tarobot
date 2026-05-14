// Compiler agent — one-shot at survey close. Renders the brief the witch
// reads + picks 3 opener questions for the tent (the live interview phase).
// Output maps engine state into the legacy Profile + Question shapes the
// tent already consumes, so the downstream UI doesn't change.

import type { LLMAdapter } from '../adapter';
import { CompilerOutputSchema } from '../schemas';
import { COMPILER_SYSTEM, COMPILER_TOOL } from '../prompts/compiler';
import type { CompilerInput, CompilerOutput } from '../types';

export async function runCompiler(
  adapter: LLMAdapter,
  input: CompilerInput,
): Promise<CompilerOutput> {
  const userPayload = {
    final_state: input.state,
    instruction:
      'the survey just closed. render the legacy Profile + 3 opener Questions + the prose_brief.',
  };

  return adapter.invoke(
    {
      system: COMPILER_SYSTEM,
      user: JSON.stringify(userPayload, null, 2),
      tool: COMPILER_TOOL,
      model: 'deep',          // use Opus for the final synthesis
      max_tokens: 4000,
    },
    CompilerOutputSchema,
  );
}
