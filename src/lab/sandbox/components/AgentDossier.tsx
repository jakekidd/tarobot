// Sandbox component — AgentDossier.
//
// Configuration surface for one selected agent. Edit name, color,
// model, prompt, declared inputs (state keys), declared output.
// Toggle in-pipeline membership. Delete agent.
//
// All edits flow through the parent's onUpdate prop. The dossier
// itself is dumb — no state of its own beyond the editing draft for
// the prompt textarea.

import { Button, Field, Stack, Row, Pill, Empty } from '../../lib';
import type { SandboxAgent, SandboxConfig } from '../types';
import { SANDBOX_PALETTE } from '../types';

type Props = {
  agent: SandboxAgent | null;
  config: SandboxConfig;
  onUpdate: (next: SandboxAgent) => void;
  onDelete: (id: string) => void;
  onTogglePipeline: (id: string) => void;
};

export function AgentDossier({ agent, config, onUpdate, onDelete, onTogglePipeline }: Props) {
  if (!agent) {
    return (
      <div className="sb-dossier sb-dossier--empty">
        <Empty>select an agent above to edit</Empty>
      </div>
    );
  }

  const inPipeline = config.pipeline.includes(agent.id);
  const stateVarOptions = config.state.map((v) => v.name);

  function update<K extends keyof SandboxAgent>(key: K, val: SandboxAgent[K]) {
    onUpdate({ ...agent!, [key]: val });
  }

  return (
    <div className="sb-dossier" style={{ borderLeftColor: agent.color }}>
      <Row gap={3} between>
        <Row gap={3}>
          <span className="sb-dossier__dot" style={{ backgroundColor: agent.color }} />
          <input
            type="text"
            className="sb-dossier__name"
            value={agent.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="agent name"
          />
          <Pill>{agent.model}</Pill>
          {inPipeline ? (
            <Pill variant="good">in pipeline</Pill>
          ) : (
            <Pill>idle</Pill>
          )}
        </Row>
        <Row gap={2}>
          <Button onClick={() => onTogglePipeline(agent.id)} variant="ghost">
            {inPipeline ? 'remove from pipeline' : 'add to pipeline'}
          </Button>
          <Button onClick={() => onDelete(agent.id)} variant="danger">delete</Button>
        </Row>
      </Row>

      <div className="sb-dossier__divider" />

      <Stack gap={4}>
        <Row gap={4} wrap>
          <Field label="model">
            <select
              className="bench__input"
              value={agent.model}
              onChange={(e) => update('model', e.target.value as SandboxAgent['model'])}
              style={{ width: 180 }}
            >
              <option value="fast">fast · haiku</option>
              <option value="cognition">cognition · sonnet</option>
              <option value="deep">deep · opus</option>
            </select>
          </Field>
          <Field label="color">
            <ColorPicker
              value={agent.color}
              onChange={(c) => update('color', c)}
            />
          </Field>
        </Row>

        <Field label="prompt" hint="system prompt sent to the model on each run">
          <textarea
            className="bench__textarea"
            value={agent.prompt}
            onChange={(e) => update('prompt', e.target.value)}
            placeholder="the role / instructions / output contract..."
            rows={10}
          />
        </Field>

        <Field label="inputs" hint="state variables this agent reads (in order). builds the user message.">
          <StateKeyMultiSelect
            options={stateVarOptions}
            value={agent.inputs}
            onChange={(next) => update('inputs', next)}
          />
        </Field>

        <Field label="output" hint="state variable this agent's full text response overwrites (empty = discard)">
          <select
            className="bench__input"
            value={agent.output}
            onChange={(e) => update('output', e.target.value)}
          >
            <option value="">(discard output)</option>
            {stateVarOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
      </Stack>
    </div>
  );
}

// ─── colour picker — pick from palette + free hex entry ────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <Row gap={2} wrap>
      {SANDBOX_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          className={`sb-color-swatch ${value.toLowerCase() === c.toLowerCase() ? 'sb-color-swatch--active' : ''}`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
          title={c}
        />
      ))}
      <input
        type="text"
        className="bench__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 90, fontFamily: 'var(--font-mono)', fontSize: 11 }}
      />
    </Row>
  );
}

// ─── multi-select for state keys ────────────────────────────

function StateKeyMultiSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) {
    return <div className="bench__text-faint bench__text-sm">no state variables declared yet — add one in the State shelf on the left</div>;
  }

  function toggle(name: string) {
    if (value.includes(name)) onChange(value.filter((v) => v !== name));
    else onChange([...value, name]);
  }

  return (
    <Row gap={2} wrap>
      {options.map((name) => {
        const active = value.includes(name);
        return (
          <button
            key={name}
            type="button"
            className={`sb-input-chip ${active ? 'sb-input-chip--active' : ''}`}
            onClick={() => toggle(name)}
          >
            {active && <span className="sb-input-chip__idx">{value.indexOf(name) + 1}</span>}
            {name}
          </button>
        );
      })}
    </Row>
  );
}
