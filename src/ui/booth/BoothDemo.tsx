// The booth demo — the full-scale e2e session in 3d: eyes in the void,
// the red table, the deck, the cards, and the speech console under the
// eyes (a typed visitor line; speech input comes with the real booth
// build). Runs the real EnsembleEngine blind-session pipeline end to
// end. The blue splitline marks the future monitor/tablet seam: top
// half eyes, bottom half table.

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

// what the room hears while the oracle is offstage — lowercase, dry
const STALLS = [
  'hmm...',
  'let me think...',
  'mm. hold on.',
  'give me a second with that.',
  'sitting with that a moment...',
  'quiet a second...',
];

export function BoothDemo({ apiKey, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<EnsembleEngine | null>(null);
  const stageRef = useRef<BoothStage | null>(null);
  const sceneRef = useRef<BoothScene | null>(null);
  const [view, setView] = useState<BoothView | null>(null);
  const [draft, setDraft] = useState('');
  const [stall, setStall] = useState(STALLS[0]);
  const wasThinking = useRef(false);
  const callsRef = useRef(new Map<string, CallRecord>());

  useEffect(() => {
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
    const calls = callsRef.current;
    const engine = new EnsembleEngine({
      adapter,
      // the booth runs the offer-loop intake (COMPOUNDING.md §5); the
      // lab keeps the ensemble intake for A/B
      input: defaultSessionInput('investigator'),
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
      const nowThinking = v.awaiting === 'oracle';
      if (nowThinking && !wasThinking.current) {
        setStall(STALLS[Math.floor(Math.random() * STALLS.length)]);
      }
      if (!nowThinking) inputRef.current?.focus();
      wasThinking.current = nowThinking;
    });
    engine.start();

    return () => {
      unsub();
      scene.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const thinking = view?.awaiting === 'oracle';

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

  const tableHint =
    view?.awaiting === 'deal'
      ? `tap the deck · ${view.cardsRemaining} to deal`
      : view?.awaiting === 'done'
        ? 'the reading is complete'
        : null;

  const placeholder = view?.cards.some((c) => c.dealt && !c.flipped)
    ? 'speak... or turn a card'
    : 'say something...';

  return (
    <div className="booth">
      <canvas ref={canvasRef} className="booth__canvas" />
      <button type="button" className="booth__exit" onClick={onExit}>
        ← menu
      </button>
      <button type="button" className="booth__exit booth__exit--copy" onClick={copyXray}>
        copy xray
      </button>
      <div className="booth__splitline" aria-hidden />
      {(thinking || view?.subtitle) && (
        <div className="booth__speech" key={thinking ? -1 : view?.subtitleSeq}>
          {thinking ? (
            <p className="booth__stall">{stall}</p>
          ) : (
            view?.subtitle?.split('\n\n').map((p, i) => <p key={i}>{p}</p>)
          )}
        </div>
      )}
      {view?.phase !== 'closed' && (
        <div className="booth__composer">
          <input
            ref={inputRef}
            className="booth__input"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            disabled={thinking}
          />
        </div>
      )}
      {tableHint && <div className="booth__tablehint">{tableHint}</div>}
      <div className="crt-overlay" aria-hidden>
        <div className="crt__scanlines" />
        <div className="crt__vignette" />
        <div className="crt__aberration" />
        <div className="crt__flicker" />
      </div>
    </div>
  );
}
