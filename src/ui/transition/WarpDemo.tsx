// Warp demo — sandbox page for the end-of-survey → reading transition.
// Self-contained: owns its own canvas, state machine, UI overlays.
// App.tsx short-circuits to this when the URL contains ?scene=warp-demo;
// everything else (TarobotScene, topbar, CRT overlay, debug chips) is
// bypassed so the demo can render fullscreen on a black background
// without contamination.
//
// Warp phase is user-driven (Infinity duration). It holds an in-tunnel
// chat with the turtle. When the agent or the user signals "ready",
// the goodbye sequence runs: the turtle drifts to face-camera center,
// the final line types out slowly, then the phase advances to
// disintegrate.

import { useEffect, useState } from 'react';
import { WarpScene } from './WarpScene';
import { WarpDebug } from './WarpDebug';
import { WarpChat } from './WarpChat';
import { setWarpLogPhase, warpLog } from './warpLog';
import type { WarpChatContext } from './warpChatAgent';

type Phase =
  | 'pre' | 'summon' | 'lock' | 'warp'
  | 'disintegrate' | 'whiteout' | 'queue';

// Warp = Infinity ⇒ user-driven (advanced when chat closes or "i'm
// ready" is clicked). In prod this is where the survey-compile stall
// hides.
const PHASE_DURATIONS_MS: Record<Phase, number> = {
  pre: 2000,
  summon: 2000,
  lock: 800,
  warp: Infinity,
  disintegrate: 2000,
  whiteout: 1500,
  queue: Infinity,
};

const PHASE_SEQUENCE: Phase[] = [
  'pre', 'summon', 'lock', 'warp', 'disintegrate', 'whiteout', 'queue',
];

// The closing line. Typed out slowly — pause on punctuation so the
// rhythm reads like real speech, not metronome.
const GOODBYE_LINE = 'ok. i love you. be safe. goodbye.';
const TYPE_MS_PER_CHAR = 110;
const PUNCT_PAUSE_MS = 600;
const TYPE_AFTER_DONE_MS = 1800;   // dwell before triggering disintegrate

// Stub survey context for the sandbox. Replace with real SurveyProfile
// + brief snippet when this gets glued in downstream.
const STUB_CONTEXT: WarpChatContext = {
  profile: { name: 'traveler', sun_sign: null, age_bracket: null },
  briefSnippet: undefined,
};

export function WarpDemo({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('pre');
  const [phaseStartMs, setPhaseStartMs] = useState<number>(() => performance.now());
  const [closingChat, setClosingChat] = useState(false);
  const [goodbyeText, setGoodbyeText] = useState('');

  function advanceFromPhase(from: Phase): void {
    const i = PHASE_SEQUENCE.indexOf(from);
    const next = PHASE_SEQUENCE[i + 1];
    if (next) {
      setPhase(next);
      setPhaseStartMs(performance.now());
    }
  }

  // Sync log buffer's phase label + log entry transitions.
  useEffect(() => {
    setWarpLogPhase(phase);
    warpLog(`enter phase: ${phase}`);
  }, [phase]);

  // Auto-advance through finite phases.
  useEffect(() => {
    const dur = PHASE_DURATIONS_MS[phase];
    if (!Number.isFinite(dur)) return;
    const t = window.setTimeout(() => advanceFromPhase(phase), dur);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Spacebar skips ahead one phase; 'r' restarts; esc exits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      // Don't hijack arrows / space while typing in the chat input.
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        warpLog('skip (space)');
        advanceFromPhase(phase);
      } else if (e.key === 'r' || e.key === 'R') {
        warpLog('restart (r)');
        setPhase('pre');
        setPhaseStartMs(performance.now());
        setClosingChat(false);
        setGoodbyeText('');
      } else if (e.key === 'Escape') {
        warpLog('exit (esc)');
        onExit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onExit]);

  // Chat → goodbye → disintegrate.
  // Triggered by the agent emitting <ready/> OR the user clicking the
  // "i'm ready" button OR the "skip to goodbye" no-key fallback.
  function beginGoodbye(): void {
    if (closingChat) return;
    setClosingChat(true);
    warpLog('chat closed — beginning goodbye sequence');

    // Slow typewriter with pauses on punctuation. Each char appended
    // via setTimeout chain (not setInterval) so the per-char delay
    // can vary.
    let i = 0;
    function tick(): void {
      i += 1;
      const slice = GOODBYE_LINE.slice(0, i);
      setGoodbyeText(slice);
      if (i >= GOODBYE_LINE.length) {
        window.setTimeout(() => {
          // Phase to disintegrate.
          setPhase('disintegrate');
          setPhaseStartMs(performance.now());
        }, TYPE_AFTER_DONE_MS);
        return;
      }
      const lastChar = GOODBYE_LINE[i - 1];
      const delay = (lastChar === '.' || lastChar === ',')
        ? TYPE_MS_PER_CHAR + PUNCT_PAUSE_MS
        : TYPE_MS_PER_CHAR;
      window.setTimeout(tick, delay);
    }
    tick();
  }

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

      <div className="warp-demo__stage">
        <WarpScene
          phase={phase}
          phaseStartMs={phaseStartMs}
          closingChat={closingChat}
        />
      </div>

      {/* Chat overlay — only during warp, only BEFORE closing. */}
      {phase === 'warp' && !closingChat && (
        <WarpChat context={STUB_CONTEXT} onReady={beginGoodbye} />
      )}

      {/* Goodbye line typewriter — during warp, AFTER closing kicks in. */}
      {phase === 'warp' && closingChat && (
        <div className="warp-demo__goodbye">
          <span className="warp-demo__goodbye-text">{goodbyeText}</span>
          {goodbyeText.length < GOODBYE_LINE.length && (
            <span className="warp-demo__goodbye-caret" aria-hidden>▍</span>
          )}
        </div>
      )}

      {/* Existing whiteout + queue overlays. */}
      {phase === 'whiteout' && <div className="warp-demo__whiteout" />}
      {phase === 'queue' && (
        <div className="warp-demo__queue">
          <div className="warp-demo__queue-line">you are #347 in line.</div>
          <div className="warp-demo__queue-sub">
            the seer will see you in approximately 47 minutes.
          </div>
          <div className="warp-demo__queue-hint">press r to replay</div>
        </div>
      )}

      <WarpDebug phase={phase} phaseStartMs={phaseStartMs} />
    </div>
  );
}
