import { useEffect, useRef, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { Spread3D } from './cards3d/Spread3D';
import {
  constructReading,
  createClaudeClient,
} from '../pipeline';
import type {
  DrawnCards,
  EnrichedProfile,
  Reading,
} from '../pipeline';
import { loadSettings } from '../storage';

type Props = {
  apiKey: string;
  profile: EnrichedProfile;
  drawn: DrawnCards;
  onReady: (reading: Reading) => void;
  onCancel: () => void;
};

const FLAVOR_LINES = [
  'i lay them in their places…',
  'four cards. four faces of the same hour.',
  'they have already begun whispering.',
  'do not look yet. they are not ready.',
];

export function Placement({ apiKey, profile, drawn, onReady, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [flavorIdx, setFlavorIdx] = useState(0);
  const startedRef = useRef(false);
  const [mountTime] = useState(() => performance.now());

  // Kick off reading construction the moment we mount; cards animate in parallel.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const client = createClaudeClient(apiKey);
        const settings = loadSettings();
        const reading = await constructReading(client, profile, drawn, settings.personaId);
        if (cancelled) return;
        // Cards take a few seconds to animate in; let that breathe even if
        // the reading came back fast.
        const minWait = 3500;
        const elapsed = performance.now() - mountTime;
        if (elapsed < minWait) {
          await new Promise((r) => setTimeout(r, minWait - elapsed));
        }
        if (cancelled) return;
        onReady(reading);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'unknown error';
        setError(msg);
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey, profile, drawn, onReady, mountTime]);

  // Cycle flavor lines while we wait.
  useEffect(() => {
    const id = window.setInterval(() => {
      setFlavorIdx((i) => (i + 1) % FLAVOR_LINES.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="screen screen--placement">
      <Reader mood="flipping" isSpeaking={speaking} />
      <Dialogue
        key={flavorIdx}
        text={FLAVOR_LINES[flavorIdx]!}
        onTypingChange={setSpeaking}
        charDelayMs={32}
      />

      <div className="placement__board">
        <Spread3D
          drawn={drawn}
          flippedIds={EMPTY_SET}
          animateIn
        />
      </div>

      {error && (
        <div className="screen__error">
          <div>{error}</div>
          <button className="btn btn--ghost" onClick={onCancel}>back to menu</button>
        </div>
      )}

      {!error && (
        <div className="placement__meta">
          <span>cards being placed…</span>
          <button className="btn btn--quiet" onClick={onCancel}>quit to menu</button>
        </div>
      )}
    </div>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();
