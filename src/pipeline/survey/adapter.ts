// LLMAdapter — the single interface every agent call goes through.
// Concrete implementations swap at construction. The engine + agents never
// import a model SDK directly; only the adapter does.

import type { ZodType } from 'zod';
import type {
  CompilerInput,
  CompilerOutput,
  DetectiveOutput,
  InterrogatorOutput,
  ObserverOutput,
  PipelineContext,
} from './types';

/** Abstract model tier — concrete adapters map to specific model IDs. */
export type ModelTier = 'fast' | 'cognition' | 'deep';

/** Tool definition in vendor-agnostic JSON Schema form. */
export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** A single agent invocation: what to call the model with. */
export type InvocationSpec = {
  system: string;
  user: string;          // pre-stringified payload
  tool: ToolDef;
  model: ModelTier;
  max_tokens: number;
};

/**
 * The single adapter primitive: invoke a model with a tool spec, get back
 * the validated tool-call output. Concrete adapters handle retries,
 * malformed-output fallbacks, and provider-specific quirks.
 */
export interface LLMAdapter {
  invoke<T>(spec: InvocationSpec, schema: ZodType<T>): Promise<T>;
}

/**
 * Higher-level helpers for typed agent calls. These exist so the engine code
 * stays focused on orchestration; the actual prompt-building lives in
 * agents/*.ts which builds an InvocationSpec and routes through invoke().
 */
export type AgentRunners = {
  runObserver(ctx: PipelineContext): Promise<ObserverOutput>;
  runDetective(ctx: PipelineContext): Promise<DetectiveOutput>;
  runInterrogator(ctx: PipelineContext): Promise<InterrogatorOutput>;
  runCompiler(input: CompilerInput): Promise<CompilerOutput>;
};
