// Warp demo — sandbox page for the end-of-survey → reading transition.
// Self-contained: owns its own canvas (when scene lands), state machine,
// UI overlays. App.tsx short-circuits to this when the URL contains
// ?scene=warp-demo; everything else (TarobotScene, topbar, CRT overlay,
// debug chips) is bypassed so the demo can render fullscreen on a
// black background without contamination.
//
// Future: when this is glued in as the real transition, it becomes a
// phase between survey close and reading mount. For now it's standalone.

import { useEffect, useState } from 'react';

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
  queue: Infinity, // sit on it until user clicks replay
};

const PHASE_SEQUENCE: Phase[] = [
  'pre', 'summon', 'lock', 'warp', 'disintegrate', 'whiteout', 'queue',
];

export function WarpDemo({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('pre');
  const [phaseStartMs, setPhaseStartMs] = useState<number>(() => performance.now());

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

  // Spacebar skips ahead one phase; 'r' restarts from the top.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault();
        const i = PHASE_SEQUENCE.indexOf(phase);
        const next = PHASE_SEQUENCE[i + 1];
        if (next) {
          setPhase(next);
          setPhaseStartMs(performance.now());
        }
      } else if (e.key === 'r' || e.key === 'R') {
        setPhase('pre');
        setPhaseStartMs(performance.now());
      } else if (e.key === 'Escape') {
        onExit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onExit]);

  // Avoid the unused-var lint warning until the scene is wired up;
  // phaseStartMs will drive smooth crossfades in the next step.
  void phaseStartMs;

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

      {/* Stage layers — built up step by step. Right now: just a placeholder. */}
      <div className="warp-demo__stage">
        <p className="warp-demo__placeholder">
          [warp scene mounts here]
        </p>
      </div>
    </div>
  );
}
