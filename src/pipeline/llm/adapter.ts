// LLMAdapter — the single interface every agent call goes through.
//
// Lives in pipeline/llm/ as shared infrastructure: both SurveyEngine
// and SeerEngine route every model call through here. The concrete
// adapter (Anthropic) is the only file that imports the SDK; the
// interface stays vendor-agnostic so an Ollama / llama.cpp swap is
// one file later.
//
// Zero coupling to either engine. Types referenced here are general
// (ZodType for schema validation) — engine-specific output types
// live with their engines.

import type { ZodType } from 'zod';

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

