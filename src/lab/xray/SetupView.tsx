// Session setup — the input side of the experiment: which docs feed the
// ensemble, the turn-0 scenario, the mode, and (session mode) the brief.

import { useState } from 'react';
import { Button, Divider, Empty, Field, Panel, Pill, Row, Stack } from '../lib';
import {
  DEFAULT_GREETING_CHAT,
  DEFAULT_GREETING_SESSION,
  DEFAULT_SCENARIO_CHAT,
  DEFAULT_SCENARIO_SESSION,
  type EnsembleMode,
  type InputDoc,
} from '../../pipeline/ensemble';
import { newDoc } from './docStore';

type Props = {
  docs: InputDoc[];
  onDocsChange: (docs: InputDoc[]) => void;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  mode: EnsembleMode;
  onModeChange: (mode: EnsembleMode) => void;
  scenario: string;
  onScenarioChange: (s: string) => void;
  greeting: string;
  onGreetingChange: (s: string) => void;
  onStart: () => void;
};

export function SetupView(p: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = p.docs.find((d) => d.id === editingId) ?? null;

  function patchDoc(id: string, patch: Partial<InputDoc>) {
    p.onDocsChange(
      p.docs.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)),
    );
  }

  function switchMode(mode: EnsembleMode) {
    p.onModeChange(mode);
    // follow the mode's defaults unless jake already customized them
    if (p.scenario === DEFAULT_SCENARIO_CHAT || p.scenario === DEFAULT_SCENARIO_SESSION) {
      p.onScenarioChange(mode === 'chat' ? DEFAULT_SCENARIO_CHAT : DEFAULT_SCENARIO_SESSION);
    }
    if (p.greeting === DEFAULT_GREETING_CHAT || p.greeting === DEFAULT_GREETING_SESSION) {
      p.onGreetingChange(mode === 'chat' ? DEFAULT_GREETING_CHAT : DEFAULT_GREETING_SESSION);
    }
  }

  return (
    <div className="xray__setup">
      <Stack gap={4}>
        <Panel
          title="mode"
          meta={<Pill variant="accent">{p.mode}</Pill>}
        >
          <Row gap={2}>
            <Button
              variant={p.mode === 'chat' ? 'primary' : 'ghost'}
              onClick={() => switchMode('chat')}
            >
              chat — conversation from zero
            </Button>
            <Button
              variant={p.mode === 'session' ? 'primary' : 'ghost'}
              onClick={() => switchMode('session')}
            >
              session — four cards
            </Button>
          </Row>
        </Panel>

        <Panel title="input docs — optional lab channel (real sessions start blind)" meta={`${p.selected.length} selected`}>
          <Stack gap={2}>
            {p.docs.length === 0 && <Empty>no docs — create one</Empty>}
            {p.docs.map((d) => (
              <div key={d.id} className="xray__doc-row">
                <input
                  type="checkbox"
                  checked={p.selected.includes(d.id)}
                  onChange={(e) =>
                    p.onSelectedChange(
                      e.target.checked
                        ? [...p.selected, d.id]
                        : p.selected.filter((id) => id !== d.id),
                    )
                  }
                />
                <input
                  className="xray__doc-name"
                  value={d.name}
                  onChange={(e) => patchDoc(d.id, { name: e.target.value })}
                />
                <Button variant="ghost" onClick={() => setEditingId(editingId === d.id ? null : d.id)}>
                  {editingId === d.id ? 'done' : 'edit'}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    p.onDocsChange(p.docs.filter((x) => x.id !== d.id));
                    p.onSelectedChange(p.selected.filter((id) => id !== d.id));
                    if (editingId === d.id) setEditingId(null);
                  }}
                >
                  delete
                </Button>
              </div>
            ))}
            {editing && (
              <textarea
                className="xray__doc-edit"
                value={editing.md}
                onChange={(e) => patchDoc(editing.id, { md: e.target.value })}
              />
            )}
            <Row gap={2}>
              <Button
                onClick={() => {
                  const d = newDoc();
                  p.onDocsChange([...p.docs, d]);
                  setEditingId(d.id);
                }}
              >
                new doc
              </Button>
            </Row>
          </Stack>
        </Panel>

        <Panel title="greeting — the scripted opening" meta={<Pill variant={p.greeting.trim() ? 'good' : 'warn'}>{p.greeting.trim() ? 'scripted' : 'generated'}</Pill>}>
          <Field
            label="spoken verbatim, one beat per paragraph; no model call"
            hint="{{name}} lines drop when no name is known; html comments are authoring notes. empty = generate the opening through the hot path (the old way; it invents things)."
          >
            <textarea
              className="xray__doc-edit"
              value={p.greeting}
              onChange={(e) => p.onGreetingChange(e.target.value)}
            />
          </Field>
        </Panel>

        <Panel title="scenario — turn 0 given circumstances">
          <Field
            label="given circumstances for the room; drives the opening only when the greeting is empty"
            hint="chat without structure is random; this is the structure."
          >
            <textarea
              className="xray__scenario"
              value={p.scenario}
              onChange={(e) => p.onScenarioChange(e.target.value)}
            />
          </Field>
        </Panel>


        <Divider />
        <Row gap={2}>
          <Button variant="primary" onClick={p.onStart}>
            begin session — blind is the real thing; docs are a lab experiment
          </Button>
        </Row>
      </Stack>
    </div>
  );
}
