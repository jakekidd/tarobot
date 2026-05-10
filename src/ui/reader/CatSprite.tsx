import { useEffect, useMemo, useRef, useState } from 'react';
import spriteData from './sprite.json';

// Unicode quadrant blocks indexed by hex digit 0..F.
// Ported from claude-cat/src/claude_cat/shared.py.
const BLOCKS = ' ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█';

type StateName = string;
type FrameRow = string;            // e.g. "00030000003000"
type Frame = FrameRow[];

type StateData = {
  frames: Frame[];
  blink?: Frame;
  mode?: 'shuffle' | 'loop' | 'hold';
  ms?: number;
  labels?: string[];
};

type ReactionData = {
  frame: Frame;
  hold?: number;
};

type SpriteData = {
  states: Record<StateName, StateData>;
  reactions: Record<string, ReactionData>;
};

const data = spriteData as SpriteData;

type Props = {
  /** State name (idle | thinking | reading | cooking | sleeping | …) */
  state?: StateName;
  /** Reaction name (happy | surprised | error | interrupted) — overrides state until hold expires */
  reaction?: string | null;
  /** Foreground color for filled cells. Default tarobot gold. */
  color?: string;
  /** Background color shown through inverse-video cells. Default near-black. */
  bg?: string;
  /** When true, cycle frames faster (used while dialogue is typing). */
  speaking?: boolean;
};

export function CatSprite({
  state = 'idle',
  reaction = null,
  color = 'var(--accent)',
  bg = 'var(--bg-2)',
  speaking = false,
}: Props) {
  const stateData = data.states[state] ?? data.states.idle!;
  const reactionData = reaction ? data.reactions[reaction] : null;

  const [frameIdx, setFrameIdx] = useState(0);
  const [blinking, setBlinking] = useState(false);
  const blinkTimerRef = useRef<number | null>(null);

  // Frame cycling per state. Note: we don't synchronously reset frameIdx on
  // state change (would be a setState-in-effect lint violation); the render
  // path falls back to frames[0] if the index is out of range, and the
  // interval below replaces it within one tick.
  useEffect(() => {
    if (reactionData) return; // freeze on reaction
    const mode = stateData.mode ?? 'shuffle';
    const ms = (stateData.ms ?? 1500) * (speaking ? 0.4 : 1);
    if (mode === 'hold' || stateData.frames.length <= 1) return;
    const id = window.setInterval(() => {
      if (mode === 'loop') {
        setFrameIdx((i) => (i + 1) % stateData.frames.length);
      } else {
        setFrameIdx(() => Math.floor(Math.random() * stateData.frames.length));
      }
    }, ms);
    return () => window.clearInterval(id);
  }, [stateData, reactionData, speaking]);

  // Random blink (only in idle, ~ every 4-9s)
  useEffect(() => {
    if (state !== 'idle' || reactionData) return;
    const schedule = () => {
      const wait = 4000 + Math.random() * 5000;
      blinkTimerRef.current = window.setTimeout(() => {
        setBlinking(true);
        window.setTimeout(() => setBlinking(false), 140);
        schedule();
      }, wait);
    };
    schedule();
    return () => {
      if (blinkTimerRef.current) window.clearTimeout(blinkTimerRef.current);
    };
  }, [state, reactionData]);

  const frame: Frame = useMemo(() => {
    if (reactionData) return reactionData.frame;
    if (blinking && stateData.blink) return stateData.blink;
    return stateData.frames[frameIdx] ?? stateData.frames[0]!;
  }, [reactionData, blinking, stateData, frameIdx]);

  return (
    <pre
      className="cat-sprite"
      aria-hidden
      style={{ ['--cat-fg' as string]: color, ['--cat-bg' as string]: bg }}
    >
      {frame.map((row, r) => (
        <div key={r} className="cat-sprite__row">
          {renderRow(row)}
        </div>
      ))}
    </pre>
  );
}

function renderRow(row: FrameRow): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let runId = 0;
  while (i < row.length) {
    const ch = row[i]!.toUpperCase();
    if (ch === 'I') {
      // Run of inverse cells — render as one span with bg color and width.
      let j = i;
      while (j < row.length && row[j]!.toUpperCase() === 'I') j++;
      const len = j - i;
      out.push(
        <span key={`r${runId++}`} className="cat-sprite__inv">
          {' '.repeat(len)}
        </span>,
      );
      i = j;
      continue;
    }
    if (ch === '0') {
      out.push(' ');
      i++;
      continue;
    }
    const idx = parseInt(ch, 16);
    out.push(BLOCKS[Number.isNaN(idx) ? 0 : idx]);
    i++;
  }
  return out;
}

export const AVAILABLE_STATES = Object.keys(data.states);
export const AVAILABLE_REACTIONS = Object.keys(data.reactions);
