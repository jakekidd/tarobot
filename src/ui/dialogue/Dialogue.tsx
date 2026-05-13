import { useEffect, useState } from 'react';
import { useTypewriter } from './useTypewriter';
import { blip } from '../sound/sound';
import { loadSettings } from '../../storage';

type Props = {
  text: string;
  charDelayMs?: number;
  soundOn?: boolean;
  onTypingChange?: (typing: boolean) => void;
  onDone?: () => void;
  clickToSkip?: boolean;
};

/**
 * Pre-allocated dialogue rig. The container is sized to the FINAL text
 * (via a hidden measure layer) so letters appear within an already-correct
 * frame. Multi-line speech (e.g. a question with an indented Clat aside on
 * the next line) is supported via `\n` in `text` + `white-space: pre-wrap`.
 */
export function Dialogue({
  text,
  charDelayMs,
  soundOn,
  onTypingChange,
  onDone,
  clickToSkip = true,
}: Props) {
  const [settings] = useState(() => loadSettings());
  const cdms = charDelayMs ?? settings.charDelayMs;
  const sound = soundOn ?? settings.soundOn;

  const { displayed, done, skip } = useTypewriter(
    text,
    cdms,
    sound ? (code) => blip(code) : undefined,
    onDone,
  );

  useEffect(() => {
    onTypingChange?.(!done);
  }, [done, onTypingChange]);

  return (
    <div
      className="dialogue-stage"
      role="region"
      aria-live="polite"
      onClick={clickToSkip && !done ? skip : undefined}
    >
      {/* Measurement layer — reserves the box at full final size. */}
      <span className="dialogue-measure" aria-hidden>{text}</span>
      {/* Visible typewriter text — absolutely positioned over the measure. */}
      <span className="dialogue-text">
        {displayed}
        {!done && <span className="dialogue-caret" aria-hidden>▍</span>}
      </span>
    </div>
  );
}
