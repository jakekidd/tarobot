// Sandbox primitive — MarbleFlow.
//
// Two-row mastermind board. Pipeline row on top (the active ordered
// sequence that runs on RUN); inventory row on bottom (every agent
// the user has created, including those not in the pipeline). No
// labels, no arrows — visual order alone tells the story.
//
// Clicking a marble selects it (in either row). A "+" tile on the
// inventory row creates a new agent.
//
// Drag-to-reorder is intentionally NOT in v1 — pipeline order is
// edited via the AgentDossier or simple shift controls. Keep the
// surface tight.

import { Marble } from './Marble';
import type { SandboxAgent, SandboxConfig } from '../types';

type Props = {
  config: SandboxConfig;
  selectedId: string | null;
  /** Id of the agent currently running, or null. Marble in this state
   *  gets a subtle pulse to surface "I'm thinking right now." */
  runningAgentId: string | null;
  onSelect: (id: string) => void;
  onAddAgent: () => void;
  onRunPipeline: () => void;
  runDisabled: boolean;
};

export function MarbleFlow({
  config,
  selectedId,
  runningAgentId,
  onSelect,
  onAddAgent,
  onRunPipeline,
  runDisabled,
}: Props) {
  const pipelineAgents: SandboxAgent[] = config.pipeline
    .map((id) => config.agents[id])
    .filter((a): a is SandboxAgent => !!a);

  // Inventory shows EVERY agent (including the ones in the pipeline).
  // This makes the relationship obvious — same marble appears in
  // both rows if it's actively wired in.
  const inventoryAgents: SandboxAgent[] = Object.values(config.agents);

  return (
    <div className="sb-flow">
      <div className="sb-flow__row sb-flow__row--pipeline">
        {pipelineAgents.length === 0 ? (
          <div className="sb-flow__hint">drop agents into the pipeline from inventory below</div>
        ) : (
          pipelineAgents.map((a) => (
            <MarbleWrap
              key={`pipe-${a.id}`}
              agent={a}
              selected={selectedId === a.id}
              running={runningAgentId === a.id}
              onClick={() => onSelect(a.id)}
            />
          ))
        )}
        <div className="sb-flow__spacer" />
        <button
          type="button"
          className="bench__btn bench__btn--primary"
          onClick={onRunPipeline}
          disabled={runDisabled}
        >
          run
        </button>
      </div>

      <div className="sb-flow__row sb-flow__row--inventory">
        {inventoryAgents.length === 0 ? (
          <div className="sb-flow__hint">no agents yet — tap + to create one</div>
        ) : (
          inventoryAgents.map((a) => (
            <MarbleWrap
              key={`inv-${a.id}`}
              agent={a}
              selected={selectedId === a.id}
              running={runningAgentId === a.id}
              onClick={() => onSelect(a.id)}
            />
          ))
        )}
        <button
          type="button"
          className="sb-marble sb-marble--add"
          onClick={onAddAgent}
          title="create new agent"
        >
          <span className="sb-marble__label">+</span>
        </button>
      </div>
    </div>
  );
}

function MarbleWrap({
  agent,
  selected,
  running,
  onClick,
}: {
  agent: SandboxAgent;
  selected: boolean;
  running: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`sb-marble-wrap ${running ? 'sb-marble-wrap--running' : ''}`}>
      <Marble agent={agent} selected={selected} onClick={onClick} />
    </div>
  );
}
