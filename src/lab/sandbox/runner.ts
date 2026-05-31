// Sandbox runner — executes a pipeline serially against an LLM
// adapter. Each agent reads its declared input state vars, gets
// streamed back through onChunk for live thinking display, and
// writes its full output to its declared output state var (or
// discards if no output is configured).
//
// No parsers in v1: agent outputs are opaque text blobs. Validation
// and parsing belong to a future iteration.

import type { LLMAdapter } from '../../pipeline/llm/adapter';
import type { SandboxAgent, SandboxConfig } from './types';

export type RunCallbacks = {
  onAgentStart: (agentId: string) => void;
  onAgentChunk: (agentId: string, chunk: string) => void;
  onAgentEnd: (agentId: string, output: string) => void;
  onStateUpdate: (state: Record<string, string>) => void;
  onError: (agentId: string, error: string) => void;
};

/** Run a pipeline serially. Returns the final state map.
 *
 *  The working state starts as a copy of config.state; each agent's
 *  output overwrites the named output key (when set). Agents
 *  reference state keys by name in their inputs[] / output. */
export async function runSandboxPipeline(
  config: SandboxConfig,
  adapter: LLMAdapter,
  cbs: RunCallbacks,
): Promise<Record<string, string>> {
  const state: Record<string, string> = Object.fromEntries(
    config.state.map((v) => [v.name, v.value]),
  );

  for (const agentId of config.pipeline) {
    const agent = config.agents[agentId];
    if (!agent) continue;

    cbs.onAgentStart(agentId);
    try {
      const userMessage = buildInputBlob(agent, state);
      const output = await adapter.invokeFreeformStreaming({
        system: agent.prompt,
        user: userMessage,
        model: agent.model,
        max_tokens: 4000,
        label: `sandbox:${agent.name || agent.id}`,
        onChunk: (chunk) => cbs.onAgentChunk(agentId, chunk),
      });
      cbs.onAgentEnd(agentId, output);
      if (agent.output) {
        state[agent.output] = output;
        cbs.onStateUpdate({ ...state });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cbs.onError(agentId, msg);
      break;
    }
  }
  return state;
}

/** Build the user message a sandbox agent receives. For each input
 *  state var, includes a header line and the current value. Inputs
 *  the agent declared but the state doesn't yet contain show as
 *  "(empty)" — explicit so the model knows the slot is intentional
 *  but unfilled, not missing. */
function buildInputBlob(agent: SandboxAgent, state: Record<string, string>): string {
  if (agent.inputs.length === 0) return '(no inputs declared)';
  const blocks = agent.inputs.map((key) => {
    const value = state[key];
    const body = value && value.trim().length > 0 ? value : '(empty)';
    return `[[${key}]]\n${body}`;
  });
  return blocks.join('\n\n');
}
