// The booth demo — the full-scale e2e session in 3d: eyes in the void,
// the red table, the deck, the cards, subtitles, and a typed visitor
// line (speech input comes with the real booth build). Runs the real
// EnsembleEngine blind-session pipeline end to end.

import './booth.css';
import { useEffect, useRef, useState } from 'react';
import { AnthropicAdapter } from '../../pipeline/antechamber';
import { createClaudeClient } from '../../pipeline/claude';
import { recordUsage } from '../../debug/usageTally';
import {
  buildXrayTranscript,
  defaultSessionInput,
  EnsembleEngine,
  serializeSession,
  type CallRecord,
  type EnsembleSnapshot,
} from '../../pipeline/ensemble';
import { BoothStage, type BoothView } from './boothStage';
import { BoothScene } from './BoothScene';

type Props = { apiKey: string; onExit: () => void };

export function BoothDemo({ apiKey, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EnsembleEngine | null>(null);
  const stageRef = useRef<BoothStage | null>(null);
  const sceneRef = useRef<BoothScene | null>(null);
  const [view, setView] = useState<BoothView | null>(null);
  const [draft, setDraft] = useState('');
  const callsRef = useRef(new Map<string, CallRecord>());

  useEffect(() => {
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
    const calls = callsRef.current;
    const engine = new EnsembleEngine({
      adapter,
      input: defaultSessionInput(),
      // the booth is the same evidence pipeline as the lab: every call
      // captured, the same SessionRecord/xray transcript on copy
      telemetry: {
        onCallStart: (rec) => calls.set(rec.id, rec),
        onCallChunk: (id, chunk) => {
          const rec = calls.get(id);
          if (rec) rec.streamed += chunk;
        },
        onCallEnd: (id, output) => {
          const rec = calls.get(id);
          if (rec) {
            rec.output = output;
            rec.endedAt = Date.now();
          }
        },
        onCallError: (id, error) => {
          const rec = calls.get(id);
          if (rec) {
            rec.error = error;
            rec.endedAt = Date.now();
          }
        },
      },
    });
    const stage = new BoothStage(engine);
    engineRef.current = engine;
    stageRef.current = stage;

    const scene = new BoothScene(canvasRef.current!, (what) => {
      if (what === 'deck') stage.clickDeck();
      else stage.clickCard(what);
      const v = stage.view();
      setView(v);
      scene.update(v);
    });
    sceneRef.current = scene;

    const unsub = engine.subscribe((snap: EnsembleSnapshot) => {
      const v = stage.view(snap);
      setView(v);
      scene.update(v);
    });
    engine.start();

    return () => {
      unsub();
      scene.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copyXray() {
    const engine = engineRef.current;
    if (!engine) return;
    const record = serializeSession(engine.input, engine.snapshot(), [
      ...callsRef.current.values(),
    ]);
    void navigator.clipboard.writeText(buildXrayTranscript(record));
  }

  function send() {
    const text = draft.trim();
    if (!text || !engineRef.current) return;
    engineRef.current.visitorLine(text);
    setDraft('');
  }

  const hint =
    view?.awaiting === 'deal'
      ? `tap the deck — ${view.cardsRemaining} to deal`
      : view?.awaiting === 'oracle'
        ? '…'
        : view?.awaiting === 'done'
          ? 'the reading is complete'
          : view?.cards.some((c) => c.dealt && !c.flipped)
            ? 'speak, or turn a card'
            : 'speak';

  return (
    <div className="booth">
      <canvas ref={canvasRef} className="booth__canvas" />
      <button type="button" className="booth__exit" onClick={onExit}>
        ← menu
      </button>
      <button type="button" className="booth__exit booth__exit--copy" onClick={copyXray}>
        copy xray
      </button>
      <div className="booth__hint">{hint}</div>
      {view?.subtitle && (
        <div className="booth__subtitle" key={view.subtitleSeq}>
          {view.subtitle.split('\n\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      {view?.phase !== 'closed' && (
        <div className="booth__composer">
          <input
            className="booth__input"
            placeholder="say something…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            disabled={view?.awaiting === 'oracle'}
          />
        </div>
      )}
    </div>
  );
}
