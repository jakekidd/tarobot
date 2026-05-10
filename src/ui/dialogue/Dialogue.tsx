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
  /** Click anywhere on the dialogue to skip the typewriter to full text. */
  clickToSkip?: boolean;
};

/**
 * Renders the speech char-by-char with punctuation pauses.
 *
 * Pre-allocates space using a hidden "measure" copy of the full text in
 * the same layout box. The visible typewriter text overlays absolutely,
 * so the container starts already-sized. No mid-typing resize.
 *
 * Capped at ~3 lines of speech height — overflow is clipped.
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
