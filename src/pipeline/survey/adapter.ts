// LLMAdapter — the single interface every agent call goes through.
// Concrete implementations swap at construction. The engine + agents never
// import a model SDK directly; only the adapter does.

import type { ZodType } from 'zod';
import type {
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

/** Freeform invocation — no tool, no schema. The model writes prose
 *  and we take its full assistant-message text. Used for Augur Stage 2
 *  (outcome documents) and any future agent where the next consumer
 *  is another LLM and a JSON schema would constrain expressivity. */
export type FreeformSpec = {
  system: string;
  user: string;
  model: ModelTier;
  max_tokens: number;
};

/**
 * The adapter primitives. Concrete impls handle retries, malformed-
 * output fallbacks, and provider-specific quirks.
 */
export interface LLMAdapter {
  invoke<T>(spec: InvocationSpec, schema: ZodType<T>): Promise<T>;
  invokeFreeform(spec: FreeformSpec): Promise<string>;
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
};
