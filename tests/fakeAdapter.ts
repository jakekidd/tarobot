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

  // Test fake mirrors the production streaming method but emits the
  // entire response as a single chunk synchronously. Tests that care
  // about chunk timing can ignore this; tests that just need the
  // streaming-aware engine path to work get the full text.
  async invokeFreeformStreaming(spec: FreeformSpec & {
    onChunk?: (chunk: string) => void;
    onStart?: () => void;
    onEnd?: () => void;
  }): Promise<string> {
    this.freeformCalls.push(spec);
    spec.onStart?.();
    const text = this.freeformResponder ? this.freeformResponder(spec) : '';
    if (text) spec.onChunk?.(text);
    spec.onEnd?.();
    return text;
  }
}

// ─── canned outputs for the v2 (Phase 3) agent shapes ─────

/** Minimal valid ObserverOutput — emits an empty delta. The
 *  `based_on_v` must match the doc.v in the engine's payload, so
 *  the responder reads it back from the spec.user JSON. */
export function defaultObserverOutput(based_on_v: number): unknown {
  return {
    delta: {
      axes_updates: {},
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: [],
    },
    based_on_v,
    reasoning: 'test no-op',
  };
}

/** Minimal valid DowserOutput — emits nothing, just an append
 *  move with no specific node_id (which the engine treats as
 *  advisory in Phase 3). */
export function defaultDowserOutput(based_on_v: number): unknown {
  return {
    scratchpad: '(test scratchpad)',
    leading_hypothesis: '',
    story_updates: {},
    next_move: { kind: 'append', reason: 'test no-op' },
    based_on_v,
    reasoning: 'test no-op',
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

/** Minimal valid CrowdOutput — 2 short decoys. Used by tests that
 *  exercise the Phase 4 generation pipeline. */
export function defaultCrowdOutput(): unknown {
  return {
    decoys: ['decoy one', 'decoy two'],
    reasoning: 'test decoys',
  };
}

/** Minimal valid InterrogatorOutput — a placeholder stem + tag.
 *  Always passes lint: lowercase, ends with '?', ≤120 chars. */
export function defaultInterrogatorOutput(): unknown {
  return {
    question_text: 'what would surprise you to admit out loud?',
    axis_tag: 'self-disclosure',
    reasoning: 'test stem',
  };
}
