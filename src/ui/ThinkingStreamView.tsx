// ThinkingStreamView — sits in the dialogue area during stage='finalizing'
// when the close-pass Compiler is running. Subscribes to
// compilerStreamBus and surfaces the model's thinking trace in real
// time. Borrows the dialogue's visual frame (centered, monospace) but
// scales down to half-size and caps at 8 visible lines (oldest pruned).
//
// The Compiler is NOT cast as the turtle. The turtle's dialogue area
// is the channel; the "speaker" is the offstage compiler thinking.
// Stream drops/skips are acceptable — graceful degradation, user just
// sees progress.

import { useEffect, useRef, useState } from 'react';
import {
  subscribeCompilerStream,
  type CompilerStreamEvent,
} from '../debug/compilerStreamBus';

const VISIBLE_LINE_CAP = 8;
const APPROX_CHARS_PER_LINE = 72;

type Props = {
  visible: boolean;
};

export function ThinkingStreamView({ visible }: Props) {
  const [text, setText] = useState('');
  /** Backing buffer holds all received text. We re-derive the visible
   *  slice (last N lines) on every render. Cheap; cap is tiny. */
  const bufferRef = useRef('');

  useEffect(() => {
    if (!visible) {
      // Hidden → we render null anyway; just drop the buffer. Stale `text`
      // state is fine: the stream's 'start' event resets it before any new
      // chunk renders. (No setState here — synchronous setState in an effect
      // body cascades renders.)
      bufferRef.current = '';
      return;
    }
    return subscribeCompilerStream((event: CompilerStreamEvent) => {
      switch (event.kind) {
        case 'start':
          bufferRef.current = '';
          setText('');
          break;
        case 'thinking':
          bufferRef.current += event.chunk;
          setText(visibleSlice(bufferRef.current));
          break;
        case 'tool_input':
          // anchor JSON is accumulating — surface a faint marker so
          // the user knows the model has moved from thinking → writing.
          // (kept lightweight: don't render the raw JSON.)
          break;
        case 'end':
          // leave the final text on screen briefly; Antechamber.tsx flips
          // stage to awaiting_intention which unmounts this view.
          break;
      }
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="thinking-stream" aria-label="compiler thinking">
      <div className="thinking-stream__head">compiler thinking</div>
      <pre className="thinking-stream__body">{text}<span className="thinking-stream__cursor">▌</span></pre>
    </div>
  );
}

/** Return the trailing slice of the buffer, hard-capped at
 *  VISIBLE_LINE_CAP wrapped lines. Wraps soft (by char count) since
 *  the model's thinking trace has variable line lengths and explicit
 *  newlines. */
function visibleSlice(full: string): string {
  // Split on explicit newlines first; then within each chunk, wrap
  // by approximate char count so a single long line doesn't blow the
  // cap.
  const raw = full.split('\n');
  const wrapped: string[] = [];
  for (const line of raw) {
    if (line.length <= APPROX_CHARS_PER_LINE) {
      wrapped.push(line);
      continue;
    }
    // Crude wrap by char count. Could use a word-aware wrapper but
    // monospace + small font + thinking-trace tolerance for choppy
    // wraps makes it not worth the cost.
    let remaining = line;
    while (remaining.length > APPROX_CHARS_PER_LINE) {
      wrapped.push(remaining.slice(0, APPROX_CHARS_PER_LINE));
      remaining = remaining.slice(APPROX_CHARS_PER_LINE);
    }
    if (remaining.length > 0) wrapped.push(remaining);
  }
  // Drop oldest until we're under cap. Top-pruning per the v3.3 plan.
  while (wrapped.length > VISIBLE_LINE_CAP) wrapped.shift();
  return wrapped.join('\n');
}
