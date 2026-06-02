// LLMAdapter — the single interface every agent call goes through.
//
// Lives in pipeline/llm/ as shared infrastructure: both AntechamberEngine
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
  /** Optional: enable Anthropic extended thinking with this token
   *  budget. Only meaningful on 'deep' tier; lower tiers may ignore
   *  or error. The Compiler is currently the only caller that opts in. */
  thinking_budget?: number;
};

/** Streaming variant. Same as InvocationSpec but the caller can hook
 *  into chunked events as they arrive — thinking deltas and the
 *  accumulating tool-input JSON. Only the Compiler streams (see the
 *  v3.3 plan: turtle dialogue surfaces the model's thinking as it
 *  builds the close-pass anchor). */
export type StreamingInvocationSpec = InvocationSpec & {
  /** Called for each thinking_delta event. Empty / dropped chunks are
   *  fine — callers are expected to handle graceful degradation. */
  onThinking?: (chunk: string) => void;
  /** Called for each input_json_delta event as the tool input
   *  accumulates. */
  onToolInput?: (chunk: string) => void;
  /** Called once when streaming starts. */
  onStart?: () => void;
  /** Called once when streaming ends (success or failure). */
  onEnd?: () => void;
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
  /** Optional caller-supplied label for telemetry / debug bus / mascot
   *  pulse color mapping. Defaults to 'freeform' if omitted. Each
   *  freeform-using agent should pass its own name (e.g. 'seeder',
   *  'diviner', 'weaver', 'intention_suggestor') so downstream
   *  observers can distinguish them. */
  label?: string;
};

/** Streaming variant of FreeformSpec. The model's prose response is
 *  streamed back as text_delta chunks; the returned promise resolves
 *  to the full concatenated text. Used by Bench's sandbox so each
 *  agent's thinking surfaces live in the right-side shelf as it
 *  generates, instead of dumping all at once at the end. */
export type FreeformStreamingSpec = FreeformSpec & {
  /** Called for each text_delta chunk as it arrives. */
  onChunk?: (chunk: string) => void;
  /** Called once when streaming starts. */
  onStart?: () => void;
  /** Called once when streaming ends (success or failure). */
  onEnd?: () => void;
};

/**
 * The adapter primitives. Concrete impls handle retries, malformed-
 * output fallbacks, and provider-specific quirks.
 */
export interface LLMAdapter {
  invoke<T>(spec: InvocationSpec, schema: ZodType<T>): Promise<T>;
  invokeStreaming<T>(spec: StreamingInvocationSpec, schema: ZodType<T>): Promise<T>;
  invokeFreeform(spec: FreeformSpec): Promise<string>;
  invokeFreeformStreaming(spec: FreeformStreamingSpec): Promise<string>;
}

