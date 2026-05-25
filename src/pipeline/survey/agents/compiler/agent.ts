// Compiler agent — v3.2 close-pass anchor writer. Runs ONCE at survey
// close, after the final observer pass + algo extraction.
//
// Tier: deep (Opus). Extended thinking ON. This is the artifact that
// ships to the seer; quality matters far more than latency on the
// last call.

import type { LLMAdapter } from '../../../llm/adapter';
import { COMPILER_SYSTEM, COMPILER_TOOL } from './prompt';
import { CompilerOutputSchema, type CompilerOutput } from './schema';
import { buildCompilerPayload, type CompilerPayloadArgs } from './payload';

export async function runCompiler(
  adapter: LLMAdapter,
  args: CompilerPayloadArgs,
): Promise<CompilerOutput> {
  return adapter.invoke(
    {
      system: COMPILER_SYSTEM,
      user: JSON.stringify(buildCompilerPayload(args), null, 2),
      tool: COMPILER_TOOL,
      model: 'deep',
      // The compiler writes prose for the artifact that ships to the
      // seer. Generous budget; this is the one place to spend on
      // quality.
      max_tokens: 6000,
    },
    CompilerOutputSchema,
  );
}
