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
  defaultSessionInput,
  EnsembleEngine,
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

  useEffect(() => {
    const adapter = new AnthropicAdapter(createClaudeClient(apiKey), recordUsage);
    const engine = new EnsembleEngine({ adapter, input: defaultSessionInput() });
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
        ← lab
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
