// Anthropic implementation of LLMAdapter. Wraps @anthropic-ai/sdk, validates
// every response through Zod, retries malformed JSON once.

import type Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import type { ClaudeClient } from '../claude';
import type {
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

export class AnthropicAdapter implements LLMAdapter {
  private readonly client: ClaudeClient;

  constructor(client: ClaudeClient) {
    this.client = client;
  }

  async invoke<T>(spec: InvocationSpec, schema: ZodType<T>): Promise<T> {
    const tool: Anthropic.Tool = {
      name: spec.tool.name,
      description: spec.tool.description,
      input_schema: spec.tool.input_schema as Anthropic.Tool['input_schema'],
    };

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
  }

  private async callOnce(spec: InvocationSpec, tool: Anthropic.Tool): Promise<unknown> {
    const response = await this.client.messages.create({
      model: MODEL_FOR[spec.model],
      max_tokens: spec.max_tokens,
      system: spec.system,
      tools: [tool],
      tool_choice: { type: 'tool', name: spec.tool.name },
      messages: [{ role: 'user', content: spec.user }],
    });

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
