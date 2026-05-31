// Anthropic implementation of LLMAdapter. Wraps @anthropic-ai/sdk, validates
// every response through Zod, retries malformed JSON once.

import type Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import type { ClaudeClient } from '../claude';
import type {
  FreeformSpec,
  FreeformStreamingSpec,
  InvocationSpec,
  LLMAdapter,
  ModelTier,
  StreamingInvocationSpec,
} from './adapter';
import {
  startAgentEvent,
  completeAgentEvent,
  failAgentEvent,
} from '../../debug/agentActivityBus';

let nextAgentEventId = 1;
function nextId(): string {
  return `ae-${nextAgentEventId++}`;
}

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
    const eventId = nextId();
    startAgentEvent({
      id: eventId,
      label: spec.tool.name,
      model: spec.model,
      system: spec.system,
      user: spec.user,
    });
    try {
      const firstCall = await this.callOnce(spec, tool);
      const firstParsed = schema.safeParse(firstCall);
      if (firstParsed.success) {
        completeAgentEvent({ id: eventId, response: firstParsed.data });
        return firstParsed.data;
      }

      // Retry once with an explicit "your last response was invalid" follow-up.
      const retryUser = spec.user
        + '\n\n[your previous response failed JSON-schema validation. respond ONLY with the tool call, exactly matching the schema.]';
      const retryCall = await this.callOnce({ ...spec, user: retryUser }, tool);
      const retryParsed = schema.safeParse(retryCall);
      if (retryParsed.success) {
        completeAgentEvent({ id: eventId, response: retryParsed.data });
        return retryParsed.data;
      }

      const errMsg =
        `adapter: tool '${spec.tool.name}' returned malformed JSON twice. issues: `
        + JSON.stringify(retryParsed.error.issues);
      failAgentEvent({ id: eventId, error: errMsg });
      throw new Error(errMsg);
    } catch (e) {
      if (e instanceof Error) failAgentEvent({ id: eventId, error: e.message });
      throw e;
    } finally {
      inFlightCount = Math.max(0, inFlightCount - 1);
    }
  }

  async invokeFreeform(spec: FreeformSpec): Promise<string> {
    inFlightCount += 1;
    lastTier = spec.model;
    const eventId = nextId();
    startAgentEvent({
      id: eventId,
      label: spec.label ?? 'freeform',
      model: spec.model,
      system: spec.system,
      user: spec.user,
    });
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
        const errMsg = `adapter.invokeFreeform: model returned no text (stop_reason=${response.stop_reason})`;
        failAgentEvent({ id: eventId, error: errMsg });
        throw new Error(errMsg);
      }
      completeAgentEvent({ id: eventId, response: text });
      return text;
    } catch (e) {
      if (e instanceof Error) failAgentEvent({ id: eventId, error: e.message });
      throw e;
    } finally {
      inFlightCount = Math.max(0, inFlightCount - 1);
    }
  }

  async invokeFreeformStreaming(spec: FreeformStreamingSpec): Promise<string> {
    inFlightCount += 1;
    lastTier = spec.model;
    const eventId = nextId();
    startAgentEvent({
      id: eventId,
      label: spec.label ?? 'freeform',
      model: spec.model,
      system: spec.system,
      user: spec.user,
    });
    spec.onStart?.();
    try {
      const modelId = MODEL_FOR[spec.model];
      const stream = this.client.messages.stream({
        model: modelId,
        max_tokens: spec.max_tokens,
        system: spec.system,
        messages: [{ role: 'user', content: spec.user }],
        stream: true,
      });
      let acc = '';
      stream.on('streamEvent', (event) => {
        try {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            acc += event.delta.text;
            spec.onChunk?.(event.delta.text);
          }
        } catch { /* swallow listener errors so the stream keeps flowing */ }
      });
      const finalMessage = await stream.finalMessage();
      if (this.onUsage && finalMessage.usage) {
        this.onUsage(modelId, {
          input_tokens: finalMessage.usage.input_tokens ?? 0,
          output_tokens: finalMessage.usage.output_tokens ?? 0,
        });
      }
      // Prefer the streamed accumulator (we caught every chunk); fall
      // back to extracting from finalMessage if the accumulator is
      // empty for any reason.
      const text = acc || finalMessage.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (!text) {
        const errMsg = `adapter.invokeFreeformStreaming: model returned no text (stop_reason=${finalMessage.stop_reason})`;
        failAgentEvent({ id: eventId, error: errMsg });
        throw new Error(errMsg);
      }
      completeAgentEvent({ id: eventId, response: text });
      return text;
    } catch (e) {
      if (e instanceof Error) failAgentEvent({ id: eventId, error: e.message });
      throw e;
    } finally {
      spec.onEnd?.();
      inFlightCount = Math.max(0, inFlightCount - 1);
    }
  }

  async invokeStreaming<T>(
    spec: StreamingInvocationSpec,
    schema: ZodType<T>,
  ): Promise<T> {
    const tool: Anthropic.Tool = {
      name: spec.tool.name,
      description: spec.tool.description,
      input_schema: spec.tool.input_schema as Anthropic.Tool['input_schema'],
    };
    inFlightCount += 1;
    lastTier = spec.model;
    const eventId = nextId();
    startAgentEvent({
      id: eventId,
      label: `${spec.tool.name} [stream]`,
      model: spec.model,
      system: spec.system,
      user: spec.user,
    });
    spec.onStart?.();
    try {
      const modelId = MODEL_FOR[spec.model];
      // Build the request body. Thinking is opt-in via thinking_budget.
      const body: Anthropic.MessageCreateParamsStreaming = {
        model: modelId,
        max_tokens: spec.max_tokens,
        system: spec.system,
        tools: [tool],
        tool_choice: { type: 'tool', name: spec.tool.name },
        messages: [{ role: 'user', content: spec.user }],
        stream: true,
      };
      if (spec.thinking_budget !== undefined) {
        // Extended thinking. Must be 'enabled' with a positive budget.
        (body as unknown as { thinking: unknown }).thinking = {
          type: 'enabled',
          budget_tokens: spec.thinking_budget,
        };
      }

      // Stream lifecycle. We accumulate the tool input JSON across
      // input_json_delta events and parse at the end. Thinking deltas
      // surface to the caller as they arrive.
      const stream = this.client.messages.stream(body);
      let accumulatedToolInput = '';
      stream.on('streamEvent', (event) => {
        try {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if (delta.type === 'thinking_delta') {
              spec.onThinking?.(delta.thinking);
            } else if (delta.type === 'input_json_delta') {
              accumulatedToolInput += delta.partial_json;
              spec.onToolInput?.(delta.partial_json);
            }
          }
        } catch { /* swallow listener errors so the stream keeps flowing */ }
      });

      const finalMessage = await stream.finalMessage();
      if (this.onUsage && finalMessage.usage) {
        this.onUsage(modelId, {
          input_tokens: finalMessage.usage.input_tokens ?? 0,
          output_tokens: finalMessage.usage.output_tokens ?? 0,
        });
      }

      const block = finalMessage.content.find(
        (b) => b.type === 'tool_use' && b.name === spec.tool.name,
      );
      if (!block || block.type !== 'tool_use') {
        const errMsg = `adapter.invokeStreaming: tool '${spec.tool.name}' not called (stop_reason=${finalMessage.stop_reason})`;
        failAgentEvent({ id: eventId, error: errMsg });
        throw new Error(errMsg);
      }
      const parsed = schema.safeParse(block.input);
      if (!parsed.success) {
        const errMsg = `adapter.invokeStreaming: tool '${spec.tool.name}' returned malformed JSON. issues: ${JSON.stringify(parsed.error.issues)}`;
        failAgentEvent({ id: eventId, error: errMsg });
        // Accumulated JSON might still be useful for debugging
        console.warn('[adapter] accumulated tool input:', accumulatedToolInput);
        throw new Error(errMsg);
      }
      completeAgentEvent({ id: eventId, response: parsed.data });
      return parsed.data;
    } catch (e) {
      if (e instanceof Error) failAgentEvent({ id: eventId, error: e.message });
      throw e;
    } finally {
      spec.onEnd?.();
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
