// Persona Sandbox — the lab page for tuning the seer's persona prompt
// against sample seeker lines. Left: the prompt editor (working vs
// committed, diff, preview). Right: the sample rail (run, stream,
// before/after, open into a thread). Bottom: clat, the assistant who
// rewrites the working draft on request. Floating: the 3D clat.
//
// This component owns all runtime state and is the only place that fires
// inference. Children are presentational.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnthropicAdapter } from '../../pipeline/antechamber';
import { createClaudeClient } from '../../pipeline/claude';
import {
  loadPersonaConfig, savePersonaConfig, visibleSamples,
  type PersonaConfig, type PersonaModel,
} from './storage';
import { makeSampleId, STARTER_SAMPLES, type Sample } from './samples';
import type { RunState } from './types';
import { RUN_CONCURRENCY, runPersona, runWithConcurrency } from './runner';
import { askClat, type ClatTurn } from './clat';
import { PromptEditor } from './PromptEditor';
import { SampleRail } from './SampleRail';
import { ThreadPanel } from './ThreadPanel';
import { ClatBar } from './ClatBar';
import { ClatCanvas } from './ClatCanvas';

type Props = { apiKey: string };

export function PersonaSandbox({ apiKey }: Props) {
  const adapter = useMemo(() => new AnthropicAdapter(createClaudeClient(apiKey)), [apiKey]);

  const [config, setConfig] = useState<PersonaConfig>(() => loadPersonaConfig());
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [running, setRunning] = useState(false);
  const [clatHistory, setClatHistory] = useState<ClatTurn[]>([]);
  const [clatThinking, setClatThinking] = useState(false);
  const [thread, setThread] = useState<Sample | null>(null);

  const samples = useMemo(() => visibleSamples(config), [config]);

  // Refs so async inference reads live state without baking it into every
  // useCallback dep list. Synced after each render (never during).
  const configRef = useRef(config);
  const runsRef = useRef(runs);
  const samplesRef = useRef(samples);
  const clatHistoryRef = useRef(clatHistory);
  const clatThinkingRef = useRef(false);
  const runningRef = useRef(false);
  useEffect(() => {
    configRef.current = config;
    runsRef.current = runs;
    samplesRef.current = samples;
    clatHistoryRef.current = clatHistory;
  });

  // Debounced persist.
  useEffect(() => {
    const id = window.setTimeout(() => savePersonaConfig(config), 300);
    return () => window.clearTimeout(id);
  }, [config]);

  const dirty = config.working !== config.committed;

  // ── inference ───────────────────────────────────────────

  const runSample = useCallback(async (id: string) => {
    const sample = samplesRef.current.find((s) => s.id === id);
    if (!sample) return;
    setRuns((r) => {
      const ex = r[id];
      const prev = ex?.status === 'done' ? ex.text : ex?.prev;
      return { ...r, [id]: { status: 'running', text: '', prev } };
    });
    const start = performance.now();
    try {
      const full = await runPersona(
        adapter, configRef.current.working, sample.quote, configRef.current.model,
        (chunk) => setRuns((r) => {
          const cur = r[id];
          return cur ? { ...r, [id]: { ...cur, text: cur.text + chunk } } : r;
        }),
      );
      setRuns((r) => ({
        ...r,
        [id]: { ...(r[id] ?? { status: 'running', text: full, prev: undefined }), status: 'done', text: full, ms: Math.round(performance.now() - start) },
      }));
    } catch (e) {
      setRuns((r) => ({
        ...r,
        [id]: { status: 'error', text: r[id]?.text ?? '', prev: r[id]?.prev, error: e instanceof Error ? e.message : 'failed' },
      }));
    }
  }, [adapter]);

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true; setRunning(true);
    try {
      await runWithConcurrency(samplesRef.current, RUN_CONCURRENCY, (s) => runSample(s.id));
    } finally {
      runningRef.current = false; setRunning(false);
    }
  }, [runSample]);

  const commit = useCallback(() => {
    setConfig((c) => ({ ...c, committed: c.working }));
    void runAll();
  }, [runAll]);

  const revert = useCallback(() => {
    setConfig((c) => ({ ...c, working: c.committed }));
  }, []);

  // ── clat ────────────────────────────────────────────────

  const sendToClat = useCallback(async (message: string) => {
    if (clatThinkingRef.current) return;
    const jade: ClatTurn = { role: 'jade', text: message };
    setClatHistory((h) => [...h, jade]);
    setClatThinking(true); clatThinkingRef.current = true;
    try {
      const responses: Record<string, string> = {};
      for (const [id, rs] of Object.entries(runsRef.current)) if (rs.text) responses[id] = rs.text;
      const result = await askClat(adapter, {
        prompt: configRef.current.working,
        samples: samplesRef.current,
        responses,
        history: [...clatHistoryRef.current, jade],
      });
      const next = result.new_prompt;
      const edited = typeof next === 'string' && next.trim().length > 0 && next !== configRef.current.working;
      if (edited) setConfig((c) => ({ ...c, working: next! }));
      setClatHistory((h) => [...h, { role: 'clat', text: result.reply, edited }]);
    } catch (e) {
      setClatHistory((h) => [...h, { role: 'clat', text: `[error: ${e instanceof Error ? e.message : 'failed'}]` }]);
    } finally {
      setClatThinking(false); clatThinkingRef.current = false;
    }
  }, [adapter]);

  const nudgeClat = useCallback((sample: Sample) => {
    const resp = runsRef.current[sample.id]?.text ?? '(not run yet)';
    void sendToClat(
      `the "${sample.tag}" sample feels off. seeker: "${sample.quote}". she replied: "${resp}". what would you change in the prompt?`,
    );
  }, [sendToClat]);

  // ── sample CRUD ─────────────────────────────────────────

  const addSample = useCallback((quote: string, tag: string) => {
    setConfig((c) => ({ ...c, customSamples: [...c.customSamples, { id: makeSampleId(), tag, quote, custom: true }] }));
  }, []);

  const deleteSample = useCallback((id: string) => {
    setConfig((c) => {
      const isStarter = STARTER_SAMPLES.some((s) => s.id === id);
      return isStarter
        ? { ...c, hiddenStarterIds: [...c.hiddenStarterIds, id] }
        : { ...c, customSamples: c.customSamples.filter((s) => s.id !== id) };
    });
    setRuns((r) => { const { [id]: _gone, ...rest } = r; void _gone; return rest; });
  }, []);

  const editSample = useCallback((id: string, quote: string) => {
    setConfig((c) => ({ ...c, customSamples: c.customSamples.map((s) => (s.id === id ? { ...s, quote } : s)) }));
  }, []);

  // ── render ──────────────────────────────────────────────

  return (
    <div className="pst">
      <div className="pst__main">
        <div className="pst__left">
          <PromptEditor
            working={config.working}
            committed={config.committed}
            dirty={dirty}
            busy={running}
            onChange={(text) => setConfig((c) => ({ ...c, working: text }))}
            onCommit={commit}
            onRevert={revert}
          />
        </div>
        <div className="pst__right">
          <SampleRail
            samples={samples}
            runs={runs}
            model={config.model}
            busy={running}
            onModelChange={(m: PersonaModel) => setConfig((c) => ({ ...c, model: m }))}
            onRunAll={() => void runAll()}
            onRunOne={(id) => void runSample(id)}
            onOpenThread={setThread}
            onNudgeClat={nudgeClat}
            onAddSample={addSample}
            onDeleteSample={deleteSample}
            onEditSample={editSample}
          />
          {thread && (
            <ThreadPanel
              sample={thread}
              seed={{ seeker: thread.quote, seer: runs[thread.id]?.status === 'done' ? runs[thread.id]?.text : undefined }}
              adapter={adapter}
              persona={config.working}
              model={config.model}
              onClose={() => setThread(null)}
            />
          )}
        </div>
      </div>

      <ClatBar history={clatHistory} thinking={clatThinking} onSend={(m) => void sendToClat(m)} />
      <ClatCanvas thinking={clatThinking} />
    </div>
  );
}
