// Shared LLM primitives. Both AntechamberEngine and SeerEngine route every
// model call through this module. The concrete adapter (Anthropic) is
// the only file that imports the SDK; the interface stays
// vendor-agnostic so an Ollama / llama.cpp swap is one file later.

export type {
  LLMAdapter,
  ModelTier,
  ToolDef,
  InvocationSpec,
  FreeformSpec,
} from './adapter';
export { AnthropicAdapter, getInFlight } from './adapter-anthropic';
export type { UsageCallback } from './adapter-anthropic';
