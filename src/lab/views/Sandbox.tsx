// Bench view — Sandbox.
//
// DIY agent pipeline workspace. Build agents (each with a prompt +
// inputs + output), drop them on a pipeline in order, declare state
// variables, hit RUN. Strictly serial, left-to-right. Output is
// opaque text written to the agent's named output variable.
//
// Layout: state shelf on the left, AgentDossier + MarbleFlow in the
// center, ThinkShelf on the right. Desktop only, fixed widths.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnthropicAdapter } from '../../pipeline/survey';
import { createClaudeClient } from '../../pipeline/claude';
import { MarbleFlow } from '../sandbox/components/MarbleFlow';
import { AgentDossier } from '../sandbox/components/AgentDossier';
import { StateShelf } from '../sandbox/components/StateShelf';
import { ThinkShelf } from '../sandbox/components/ThinkShelf';
import { loadSandboxConfig, saveSandboxConfig } from '../sandbox/storage';
import { runSandboxPipeline } from '../sandbox/runner';
import {
  generateAgentId,
  pickRandomColor,
  type RunStatus,
  type SandboxAgent,
  type SandboxConfig,
  type ThoughtEntry,
} from '../sandbox/types';

type Props = { apiKey: string };

export function Sandbox({ apiKey }: Props) {
  const [config, setConfig] = useState<SandboxConfig>(() => loadSandboxConfig());
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedStateVar, setSelectedStateVar] = useState<string | null>(null);
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>({ kind: 'idle' });

  // Persist on any config change.
  useEffect(() => {
    saveSandboxConfig(config);
  }, [config]);

  // Adapter lives across runs — single client per apiKey.
  const adapter = useMemo(() => {
    return new AnthropicAdapter(createClaudeClient(apiKey));
  }, [apiKey]);

  const runningRef = useRef(false);

  // ── agent CRUD ─────────────────────────────────────────

  const addAgent = useCallback(() => {
    setConfig((c) => {
      const id = generateAgentId();
      const idx = Object.keys(c.agents).length + 1;
      const agent: SandboxAgent = {
        id,
        name: `agent-${idx}`,
        color: pickRandomColor(),
        model: 'cognition',
        prompt: 'You are an agent. Read the inputs and write a response.',
        inputs: [],
        output: '',
      };
      return { ...c, agents: { ...c.agents, [id]: agent } };
    });
    // selectedAgentId update happens after re-render; defer to next tick.
    setTimeout(() => {
      setConfig((c) => {
        const ids = Object.keys(c.agents);
        const last = ids[ids.length - 1];
        if (last) setSelectedAgentId(last);
        return c;
      });
    }, 0);
  }, []);

  const updateAgent = useCallback((next: SandboxAgent) => {
    setConfig((c) => ({ ...c, agents: { ...c.agents, [next.id]: next } }));
  }, []);

  const deleteAgent = useCallback((id: string) => {
    setConfig((c) => {
      const { [id]: _gone, ...rest } = c.agents;
      void _gone;
      return {
        ...c,
        agents: rest,
        pipeline: c.pipeline.filter((p) => p !== id),
      };
    });
    setSelectedAgentId(null);
  }, []);

  const togglePipeline = useCallback((id: string) => {
    setConfig((c) => {
      const exists = c.pipeline.includes(id);
      const pipeline = exists
        ? c.pipeline.filter((p) => p !== id)
        : [...c.pipeline, id];
      return { ...c, pipeline };
    });
  }, []);

  // ── state CRUD ─────────────────────────────────────────

  const addStateVar = useCallback((name: string) => {
    setConfig((c) => ({
      ...c,
      state: [...c.state, { name, value: '' }],
    }));
  }, []);

  const updateStateVar = useCallback((name: string, value: string) => {
    setConfig((c) => ({
      ...c,
      state: c.state.map((v) => (v.name === name ? { ...v, value } : v)),
    }));
  }, []);

  const deleteStateVar = useCallback((name: string) => {
    setConfig((c) => ({
      ...c,
      state: c.state.filter((v) => v.name !== name),
      // also clean up any references in agents
      agents: Object.fromEntries(
        Object.entries(c.agents).map(([id, a]) => [
          id,
          {
            ...a,
            inputs: a.inputs.filter((k) => k !== name),
            output: a.output === name ? '' : a.output,
          },
        ]),
      ),
    }));
    if (selectedStateVar === name) setSelectedStateVar(null);
  }, [selectedStateVar]);

  // ── run ─────────────────────────────────────────────────

  const onRun = useCallback(async () => {
    if (runningRef.current) return;
    if (config.pipeline.length === 0) return;
    runningRef.current = true;
    setThoughts([]);
    setRunStatus({ kind: 'running', currentAgentId: config.pipeline[0]! });
    try {
      const finalState = await runSandboxPipeline(config, adapter, {
        onAgentStart: (agentId) => {
          setRunStatus({ kind: 'running', currentAgentId: agentId });
        },
        onAgentChunk: (agentId, chunk) => {
          setThoughts((prev) => [...prev, { agentId, text: chunk, ts: Date.now() }]);
        },
        onAgentEnd: (_id, _output) => {
          /* no-op — onStateUpdate handles the write */
          void _id; void _output;
        },
        onStateUpdate: (next) => {
          setConfig((c) => ({
            ...c,
            state: c.state.map((v) =>
              v.name in next ? { ...v, value: next[v.name] ?? v.value } : v,
            ),
          }));
        },
        onError: (agentId, error) => {
          setRunStatus({ kind: 'failed', agentId, error });
        },
      });
      void finalState;
      setRunStatus((s) => s.kind === 'failed' ? s : { kind: 'done', finishedAt: Date.now() });
    } finally {
      runningRef.current = false;
    }
  }, [adapter, config]);

  // ── render ──────────────────────────────────────────────

  const selectedAgent = selectedAgentId ? (config.agents[selectedAgentId] ?? null) : null;
  const runningAgentId =
    runStatus.kind === 'running' ? runStatus.currentAgentId : null;
  const runDisabled = config.pipeline.length === 0 || runStatus.kind === 'running';

  return (
    <div className="sb-grid">
      <aside className="sb-grid__left">
        <StateShelf
          state={config.state}
          selectedName={selectedStateVar}
          onSelect={setSelectedStateVar}
          onAdd={addStateVar}
          onUpdate={updateStateVar}
          onDelete={deleteStateVar}
        />
      </aside>

      <main className="sb-grid__center">
        <div className="sb-grid__dossier">
          <AgentDossier
            agent={selectedAgent}
            config={config}
            onUpdate={updateAgent}
            onDelete={deleteAgent}
            onTogglePipeline={togglePipeline}
          />
        </div>
        <div className="sb-grid__flow">
          {runStatus.kind === 'failed' && (
            <div className="sb-run-error">
              <strong>{config.agents[runStatus.agentId]?.name ?? 'agent'}</strong>: {runStatus.error}
            </div>
          )}
          <MarbleFlow
            config={config}
            selectedId={selectedAgentId}
            runningAgentId={runningAgentId}
            onSelect={setSelectedAgentId}
            onAddAgent={addAgent}
            onRunPipeline={onRun}
            runDisabled={runDisabled}
          />
        </div>
      </main>

      <aside className="sb-grid__right">
        <ThinkShelf
          thoughts={thoughts}
          config={config}
          runningAgentId={runningAgentId}
        />
      </aside>
    </div>
  );
}
