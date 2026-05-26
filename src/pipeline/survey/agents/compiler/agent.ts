// Compiler agent — close-pass anchor writer. Runs ONCE at survey
// close. Streams its output (thinking deltas + accumulating anchor
// JSON) to the dialogue surface via the compilerStreamBus.
//
// Tier: deep (Opus 4.7) with extended thinking enabled. Generous token
// budget — this is the artifact that ships to the seer; the latency is
// covered by the UI showing the model's reasoning in real time.

import type { LLMAdapter, StreamingInvocationSpec } from '../../../llm/adapter';
import { COMPILER_SYSTEM, COMPILER_TOOL } from './prompt';
import { CompilerOutputSchema, type CompilerOutput } from './schema';
import { buildCompilerPayload, type CompilerPayloadArgs } from './payload';

export type RunCompilerStreamHandlers = {
  onThinking?: (chunk: string) => void;
  onToolInput?: (chunk: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
};

export async function runCompiler(
  adapter: LLMAdapter,
  args: CompilerPayloadArgs,
  handlers: RunCompilerStreamHandlers = {},
): Promise<CompilerOutput> {
  const spec: StreamingInvocationSpec = {
    system: COMPILER_SYSTEM,
    user: JSON.stringify(buildCompilerPayload(args), null, 2),
    tool: COMPILER_TOOL,
    model: 'deep',
    // Generous cap — extended thinking + a narrow prose anchor still
    // fits comfortably under this. Acts as a safety ceiling.
    max_tokens: 16000,
    // Extended thinking ON — surfaces a real reasoning trace via
    // thinking_delta events. ~8K thinking tokens is plenty for a
    // single-Dilemma synthesis pass.
    thinking_budget: 8000,
    onThinking: handlers.onThinking,
    onToolInput: handlers.onToolInput,
    onStart: handlers.onStart,
    onEnd: handlers.onEnd,
  };
  return adapter.invokeStreaming(spec, CompilerOutputSchema);
}
