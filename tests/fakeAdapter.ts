// Fake LLMAdapter for unit tests. Returns canned responses configured
// per agent name — no inference, no network. The engine wiring drives
// the state machine; this fake fills in the agent outputs so flows can
// run end-to-end without API keys.

import type { ZodType } from 'zod';
import type { FreeformSpec, InvocationSpec, LLMAdapter } from '../src/pipeline/llm/adapter';

type Responder = (spec: InvocationSpec) => unknown;
type FreeformResponder = (spec: FreeformSpec) => string;

export class FakeAdapter implements LLMAdapter {
  private responders = new Map<string, Responder>();
  private freeformResponder: FreeformResponder | null = null;
  public calls: Array<{ tool: string; spec: InvocationSpec }> = [];
  public freeformCalls: FreeformSpec[] = [];

  /** Register a canned response keyed by tool name (e.g. 'observer_metabolize'). */
  setTool(toolName: string, responder: Responder): this {
    this.responders.set(toolName, responder);
    return this;
  }

  /** Convenience: same canned value for every call to this tool. */
  setToolValue(toolName: string, value: unknown): this {
    return this.setTool(toolName, () => value);
  }

  setFreeform(responder: FreeformResponder): this {
    this.freeformResponder = responder;
    return this;
  }

  setFreeformValue(value: string): this {
    return this.setFreeform(() => value);
  }

  async invoke<T>(spec: InvocationSpec, _schema: ZodType<T>): Promise<T> {
    this.calls.push({ tool: spec.tool.name, spec });
    const responder = this.responders.get(spec.tool.name);
    if (!responder) {
      throw new Error(`[FakeAdapter] no response registered for tool '${spec.tool.name}'`);
    }
    return responder(spec) as T;
  }

  async invokeFreeform(spec: FreeformSpec): Promise<string> {
    this.freeformCalls.push(spec);
    if (this.freeformResponder) return this.freeformResponder(spec);
    return '';
  }
}

// ─── canned outputs for the v2 agent shapes ───────────────

/** Minimal valid ObserverOutput — emits a body, no other changes. */
export function defaultObserverOutput(profileBody: string): unknown {
  return {
    profile_body: profileBody,
    hooks: [],
    edges: [],
    side_channel: {},
    cast_notes_updates: [],
    hypothesis_ladder_moves: [],
    reasoning: 'no-op',
  };
}

/** Minimal valid DetectiveOutput — emits nothing, just scratchpad. */
export function defaultDetectiveOutput(): unknown {
  return {
    new_hypotheses: [],
    hypothesis_ladder_moves: [],
    story_updates: {},
    private_thoughts: '(test scratchpad)',
    reasoning: 'no-op',
  };
}

/** Minimal valid Augur outline — two outcomes. */
export function defaultAugurOutline(name: string): unknown {
  return {
    outcomes: [
      { id: 'outcome-a', label: `${name} chooses A` },
      { id: 'outcome-b', label: `${name} chooses B` },
    ],
    reasoning: 'binary fork',
  };
}
