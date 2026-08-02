// The xray lab — the ensemble reading engine's debug surface. One
// surface, xray always on: setup (docs, scenario, mode, brief) then the
// live table flanked by cognition and behavior columns, every model
// call streamed and inspectable.

import '../bench.css';
import './xray.css';
import { useEffect, useReducer, useState } from 'react';
import { Button, Pill } from '../lib';
import { AnthropicAdapter } from '../../pipeline/antechamber';
import { createClaudeClient } from '../../pipeline/claude';
import { recordUsage } from '../../debug/usageTally';
import {
  buildSessionLog,
  DEFAULT_GREETING_SESSION,
  DEFAULT_SCENARIO_SESSION,
  EnsembleEngine,
  serializeSession,
  type CallRecord,
  type EnsembleInput,
  type EnsembleMode,
  type EnsembleSnapshot,
  type InputDoc,
} from '../../pipeline/ensemble';
import { ConfigPanel } from './ConfigPanel';
import { loadDocs, saveDocs } from './docStore';
import { Inspector } from './Inspector';
import { BehaviorColumn, CognitionColumn, TablePane } from './panes';
import { SetupView } from './SetupView';

type Props = {
  apiKey: string;
  onExit: () => void;
};

export function XrayLab({ apiKey, onExit }: Props) {
  // ---- setup state
  const [docs, setDocs] = useState<InputDoc[]>(() => loadDocs());
  const [selected, setSelected] = useState<string[]>(() => {
    const first = loadDocs()[0];
    return first ? [first.id] : [];
  });
  // session is the product; chat-from-zero is kept only as a lab probe
  const [mode, setMode] = useState<EnsembleMode>('session');
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO_SESSION);
  const [greeting, setGreeting] = useState(DEFAULT_GREETING_SESSION);

  useEffect(() => {
    saveDocs(docs);
  }, [docs]);

  // ---- live state
  const [engine, setEngine] = useState<EnsembleEngine | null>(null);
  const [snap, setSnap] = useState<EnsembleSnapshot | null>(null);
  const [autoSilence, setAutoSilence] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);

  // telemetry — a stable mutable store (state-held so render reads are
  // legal), mutated by the telemetry callbacks, version-bumped for render
  const [callStore, setCallStore] = useState(() => new Map<string, CallRecord>());
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const calls = [...callStore.values()];

  function start() {
    const input: EnsembleInput = {
      mode,
      docs: docs.filter((d) => selected.includes(d.id)),
      scenario,
      greeting: greeting.trim() ? greeting : undefined,
      taboos: [],
    };
    const store = new Map<string, CallRecord>();
    setCallStore(store);
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
    const eng = new EnsembleEngine({
      adapter,
      input,
      telemetry: {
        onCallStart: (rec) => {
          store.set(rec.id, rec);
          bump();
        },
        onCallChunk: (id, chunk) => {
          const rec = store.get(id);
          if (rec) rec.streamed += chunk;
          bump();
        },
        onCallEnd: (id, output) => {
          const rec = store.get(id);
          if (rec) {
            rec.output = output;
            rec.endedAt = Date.now();
          }
          bump();
        },
        onCallError: (id, error) => {
          const rec = store.get(id);
          if (rec) {
            rec.error = error;
            rec.endedAt = Date.now();
          }
          bump();
        },
      },
    });
    eng.subscribe(setSnap);
    setEngine(eng);
    eng.start();
  }

  function endSession() {
    setEngine(null);
    setSnap(null);
    setAutoSilence(false);
    setInspectId(null);
  }

  // auto silence clock — default OFF; the manual button is primary
  const livePhase = snap?.phase ?? null;
  useEffect(() => {
    if (!autoSilence || !engine || livePhase !== 'live') return;
    const handle = window.setInterval(() => engine.silenceTick(), 7000);
    return () => window.clearInterval(handle);
  }, [autoSilence, engine, livePhase]);

  function download(name: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // the SAME SessionRecord shape the headless e2e writes — a browser
  // session and a terminal session are interchangeable evidence
  function exportSession() {
    if (!engine) return;
    const record = serializeSession(engine.input, engine.snapshot(), [...callStore.values()]);
    download(`xray-session-${Date.now()}.json`, JSON.stringify(record, null, 2), 'application/json');
  }

  function exportLog() {
    if (!engine) return;
    const record = serializeSession(engine.input, engine.snapshot(), [...callStore.values()]);
    download(`xray-transcript-${Date.now()}.md`, buildSessionLog(record), 'text/markdown');
  }

  const inspecting = inspectId ? (callStore.get(inspectId) ?? null) : null;

  return (
    <div className="bench">
      <div className="xray">
        <div className="xray__topbar">
          <span className="xray__topbar-title">xray lab</span>
          <Pill variant="accent">{engine ? snap?.mode : mode}</Pill>
          {engine && snap && <Pill>{snap.phase}</Pill>}
          <span className="xray__topbar-spacer" />
          {engine && (
            <>
              <Button variant="ghost" onClick={exportSession}>
                export json
              </Button>
              <Button variant="ghost" onClick={exportLog}>
                export log
              </Button>
              <Button variant="danger" onClick={endSession}>
                end session
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onExit}>
            ← menu
          </Button>
        </div>

        {!engine && (
          <SetupView
            docs={docs}
            onDocsChange={setDocs}
            selected={selected}
            onSelectedChange={setSelected}
            mode={mode}
            onModeChange={setMode}
            scenario={scenario}
            onScenarioChange={setScenario}
            greeting={greeting}
            onGreetingChange={setGreeting}
            onStart={start}
          />
        )}

        {engine && snap && (
          <div className="xray__layout">
            <div className="xray__col">
              <CognitionColumn snap={snap} calls={calls} onInspect={setInspectId} />
            </div>
            <div className="xray__col">
              <TablePane
                snap={snap}
                onSend={(text) => engine.visitorLine(text)}
                onSilence={() => engine.silenceTick()}
                onFlip={(slot) => engine.flip(slot)}
                autoSilence={autoSilence}
                onAutoSilence={setAutoSilence}
              />
            </div>
            <div className="xray__col">
              <ConfigPanel
                constants={snap.constants}
                onChange={(partial) => engine.updateConstants(partial)}
              />
              <BehaviorColumn snap={snap} calls={calls} onInspect={setInspectId} />
            </div>
          </div>
        )}

        {inspecting && <Inspector call={inspecting} onClose={() => setInspectId(null)} />}
      </div>
    </div>
  );
}
