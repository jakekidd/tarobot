// Anthropic implementation of LLMAdapter. Wraps @anthropic-ai/sdk, validates
// every response through Zod, retries malformed JSON once.

import type Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import type { ClaudeClient } from '../claude';
import type {
  FreeformSpec,
  InvocationSpec,
  LLMAdapter,
  ModelTier,
} from './adapter';

// Tier → concrete model id. Easy to retune without touching engine code.
const MODEL_FOR: Record<ModelTier, string> = {
  fast:      'claude-haiku-4-5',
  cognition: 'claude-sonnet-4-6',
  deep:      'claude-opus-4-7',
};

// Module-level in-flight counter for the debug overlay. Increments before
// the model call, decrements after (regardless of success/failure).
let inFlightCount = 0;
let lastTier: ModelTier | null = null;

export function getInFlight(): { count: number; lastTier: ModelTier | null } {
  return { count: inFlightCount, lastTier };
}

export type UsageCallback = (
  model: string,
  usage: { input_tokens: number; output_tokens: number },
) => void;

export class AnthropicAdapter implements LLMAdapter {
  private readonly client: ClaudeClient;
  private readonly onUsage: UsageCallback | undefined;

  constructor(client: ClaudeClient, onUsage?: UsageCallback) {
    this.client = client;
    this.onUsage = onUsage;
  }

  async invoke<T>(spec: InvocationSpec, schema: ZodType<T>): Promise<T> {
    const tool: Anthropic.Tool = {
      name: spec.tool.name,
      description: spec.tool.description,
      input_schema: spec.tool.input_schema as Anthropic.Tool['input_schema'],
    };

    inFlightCount += 1;
    lastTier = spec.model;
    try {
      const firstCall = await this.callOnce(spec, tool);
      const firstParsed = schema.safeParse(firstCall);
      if (firstParsed.success) return firstParsed.data;

      // Retry once with an explicit "your last response was invalid" follow-up.
      const retryUser = spec.user
        + '\n\n[your previous response failed JSON-schema validation. respond ONLY with the tool call, exactly matching the schema.]';
      const retryCall = await this.callOnce({ ...spec, user: retryUser }, tool);
      const retryParsed = schema.safeParse(retryCall);
      if (retryParsed.success) return retryParsed.data;

      throw new Error(
        `adapter: tool '${spec.tool.name}' returned malformed JSON twice. issues: `
        + JSON.stringify(retryParsed.error.issues),
      );
    } finally {
      inFlightCount = Math.max(0, inFlightCount - 1);
    }
  }

  async invokeFreeform(spec: FreeformSpec): Promise<string> {
    inFlightCount += 1;
    lastTier = spec.model;
    try {
      const modelId = MODEL_FOR[spec.model];
      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: spec.max_tokens,
        system: spec.system,
        messages: [{ role: 'user', content: spec.user }],
      });
      if (this.onUsage && response.usage) {
        this.onUsage(modelId, {
          input_tokens: response.usage.input_tokens ?? 0,
          output_tokens: response.usage.output_tokens ?? 0,
        });
      }
      // Concatenate all text blocks; ignore tool-use blocks if any.
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (!text) {
        throw new Error(`adapter.invokeFreeform: model returned no text (stop_reason=${response.stop_reason})`);
      }
      return text;
    } finally {
      inFlightCount = Math.max(0, inFlightCount - 1);
    }
  }

  private async callOnce(spec: InvocationSpec, tool: Anthropic.Tool): Promise<unknown> {
    const modelId = MODEL_FOR[spec.model];
    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: spec.max_tokens,
      system: spec.system,
      tools: [tool],
      tool_choice: { type: 'tool', name: spec.tool.name },
      messages: [{ role: 'user', content: spec.user }],
    });

    if (this.onUsage && response.usage) {
      this.onUsage(modelId, {
        input_tokens: response.usage.input_tokens ?? 0,
        output_tokens: response.usage.output_tokens ?? 0,
      });
    }

    const block = response.content.find(
      (b) => b.type === 'tool_use' && b.name === spec.tool.name,
    );
    if (!block || block.type !== 'tool_use') {
      throw new Error(
        `adapter: tool '${spec.tool.name}' not called (stop_reason=${response.stop_reason})`,
      );
    }
    return block.input;
  }
}
