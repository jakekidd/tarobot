// The xray lab — the ensemble reading engine's debug surface. One
// surface, xray always on: setup (docs, scenario, mode, brief) then the
// live table flanked by cognition and behavior columns, every model
// call streamed and inspectable.

import '../bench.css';
import './xray.css';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Button, Pill } from '../lib';
import { AnthropicAdapter } from '../../pipeline/antechamber';
import { createClaudeClient } from '../../pipeline/claude';
import { recordUsage } from '../../debug/usageTally';
import {
  buildSessionLog,
  buildXrayTranscript,
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
import { loadCasting, saveCasting, simNextLine } from './visitorSim';
import { Inspector } from './Inspector';
import { BehaviorColumn, CognitionColumn, TablePane } from './panes';
import { SetupView } from './SetupView';

type Props = {
  apiKey: string;
  onExit: () => void;
  onBooth?: () => void;
};

export function XrayLab({ apiKey, onExit, onBooth }: Props) {
  // ---- setup state
  const [docs, setDocs] = useState<InputDoc[]>(() => loadDocs());
  const [selected, setSelected] = useState<string[]>(() => {
    const first = loadDocs()[0];
    return first ? [first.id] : [];
  });
  // session is the product; chat-from-zero is kept only as a lab probe
  const [mode, setMode] = useState<EnsembleMode>('session');
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO_SESSION);
  const [casting, setCasting] = useState(() => loadCasting());

  useEffect(() => {
    saveDocs(docs);
  }, [docs]);
  useEffect(() => {
    saveCasting(casting);
  }, [casting]);

  // ---- live state
  const [engine, setEngine] = useState<EnsembleEngine | null>(null);
  const [snap, setSnap] = useState<EnsembleSnapshot | null>(null);
  const [autoSilence, setAutoSilence] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);

  // ---- the cast visitor (the right-hand composer)
  // sim: the generated line, editable once it lands. locked (empty)
  // after any send; regenerates once per oracle response cycle — if the
  // oracle keeps talking while a line sits here, it stays as-is.
  const [sim, setSim] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const simState = useRef({ generatedFor: -1, inFlight: false });

  // telemetry — a stable mutable store (state-held so render reads are
  // legal), mutated by the telemetry callbacks, version-bumped for render
  const [callStore, setCallStore] = useState(() => new Map<string, CallRecord>());
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const calls = [...callStore.values()];

  // regenerate the cast visitor's line after each oracle response cycle
  useEffect(() => {
    if (!engine || !snap || snap.phase !== 'live' || snap.busy !== null) return;
    const oracleBeats = snap.scroll.filter(
      (e) => e.kind === 'beat' && e.speaker === 'oracle',
    ).length;
    const st = simState.current;
    if (st.inFlight || oracleBeats <= st.generatedFor) return;
    if (sim.trim()) return; // a line is already sitting there — leave it
    st.inFlight = true;
    st.generatedFor = oracleBeats;
    queueMicrotask(() => setSimBusy(true));
    const transcript = snap.scroll
      .filter((e) => e.kind === 'beat')
      .map((e) => (e.kind === 'beat' ? `${e.speaker}: ${e.text}` : ''))
      .join('\n');
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
    void simNextLine(adapter, casting, transcript)
      .then((line) => setSim(line))
      .catch(() => setSim(''))
      .finally(() => {
        st.inFlight = false;
        setSimBusy(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, engine]);

  function sendVisitor(text: string) {
    if (!engine) return;
    setSim('');
    simState.current.generatedFor = engine
      .snapshot()
      .scroll.filter((e) => e.kind === 'beat' && e.speaker === 'oracle').length;
    engine.visitorLine(text);
  }

  function copyXray() {
    if (!engine) return;
    const record = serializeSession(engine.input, engine.snapshot(), [...callStore.values()]);
    void navigator.clipboard.writeText(buildXrayTranscript(record));
  }

  function start() {
    setSim('');
    simState.current = { generatedFor: -1, inFlight: false };
    const input: EnsembleInput = {
      mode,
      docs: docs.filter((d) => selected.includes(d.id)),
      scenario,
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
              <Button variant="ghost" onClick={copyXray}>
                copy xray
              </Button>
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
          {onBooth && !engine && (
            <Button variant="ghost" onClick={onBooth}>
              booth demo
            </Button>
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
            casting={casting}
            onCastingChange={setCasting}
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
                onSend={sendVisitor}
                onSilence={() => engine.silenceTick()}
                onFlip={(slot) => engine.flip(slot)}
                autoSilence={autoSilence}
                onAutoSilence={setAutoSilence}
                sim={sim}
                onSimChange={setSim}
                simBusy={simBusy}
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
