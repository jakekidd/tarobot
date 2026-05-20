// Warp demo — sandbox page for the end-of-survey → reading transition.
// Self-contained: owns its own canvas, state machine, UI overlays.
// App.tsx short-circuits to this when the URL contains ?scene=warp-demo;
// everything else (TarobotScene, topbar, CRT overlay, debug chips) is
// bypassed so the demo can render fullscreen on a black background
// without contamination.
//
// Future: when this is glued in as the real end-of-survey transition,
// it becomes a phase between survey close and reading mount. For now
// it's a standalone sandbox.

import { useEffect, useState } from 'react';
import { WarpScene } from './WarpScene';
import { WarpDebug } from './WarpDebug';
import { setWarpLogPhase, warpLog } from './warpLog';

type Phase =
  | 'pre'            // turtle wanders, dialogue holds the final survey line
  | 'summon'         // stars accelerate; turtle drawn to center
  | 'lock'           // swirl snaps to radial alignment
  | 'warp'           // hyperspace + dialogue beats
  | 'disintegrate'   // turtle vaporizes
  | 'whiteout'       // flash → black → silence
  | 'queue';         // mock queue card

const PHASE_DURATIONS_MS: Record<Phase, number> = {
  pre: 2000,
  summon: 2000,
  lock: 500,
  warp: 6500,
  disintegrate: 2000,
  whiteout: 1500,
  queue: Infinity, // sit on it until user clicks replay / restart
};

const PHASE_SEQUENCE: Phase[] = [
  'pre', 'summon', 'lock', 'warp', 'disintegrate', 'whiteout', 'queue',
];

export function WarpDemo({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('pre');
  const [phaseStartMs, setPhaseStartMs] = useState<number>(() => performance.now());

  // Keep the log buffer's phase label synced with React state so log
  // lines emitted from non-React code (the scene, future shaders) get
  // tagged correctly.
  useEffect(() => {
    setWarpLogPhase(phase);
    warpLog(`enter phase: ${phase}`);
  }, [phase]);

  // Auto-advance through the sequence on a timer per phase.
  useEffect(() => {
    const dur = PHASE_DURATIONS_MS[phase];
    if (!Number.isFinite(dur)) return;
    const t = window.setTimeout(() => {
      const i = PHASE_SEQUENCE.indexOf(phase);
      const next = PHASE_SEQUENCE[i + 1];
      if (next) {
        setPhase(next);
        setPhaseStartMs(performance.now());
      }
    }, dur);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Spacebar skips ahead one phase; 'r' restarts from the top; esc exits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault();
        const i = PHASE_SEQUENCE.indexOf(phase);
        const next = PHASE_SEQUENCE[i + 1];
        if (next) {
          warpLog('skip (space)');
          setPhase(next);
          setPhaseStartMs(performance.now());
        }
      } else if (e.key === 'r' || e.key === 'R') {
        warpLog('restart (r)');
        setPhase('pre');
        setPhaseStartMs(performance.now());
      } else if (e.key === 'Escape') {
        warpLog('exit (esc)');
        onExit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onExit]);

  return (
    <div className="warp-demo">
      <button
        type="button"
        className="warp-demo__exit"
        onClick={onExit}
        title="leave the demo"
      >
        ← exit
      </button>

      <div className="warp-demo__hud">
        <div className="warp-demo__phase">phase · {phase}</div>
        <div className="warp-demo__hint">space = skip · r = restart · esc = exit</div>
      </div>

      {/* Three.js scene — bare skeleton with debug helpers. Star
          shader / turtle / disintegrate FX layer in here next. */}
      <div className="warp-demo__stage">
        <WarpScene />
      </div>

      <WarpDebug phase={phase} phaseStartMs={phaseStartMs} />
    </div>
  );
}
