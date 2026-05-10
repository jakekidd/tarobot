import { useEffect, useState } from 'react';
import { useTypewriter } from './useTypewriter';
import { blip } from '../sound/sound';
import { loadSettings } from '../../storage';

type Props = {
  text: string;
  /** Override settings.charDelayMs for this instance. */
  charDelayMs?: number;
  /** Override settings.soundOn for this instance. */
  soundOn?: boolean;
  onTypingChange?: (typing: boolean) => void;
  onDone?: () => void;
  /** When true, clicking the dialogue area skips to full text. */
  clickToSkip?: boolean;
};

/**
 * Renders text char-by-char with synthesized typewriter blips.
 * Reports typing state to parent via onTypingChange so a Reader component
 * can sync its mouth animation.
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
      className="dialogue"
      role="region"
      aria-live="polite"
      onClick={clickToSkip && !done ? skip : undefined}
    >
      <span className="dialogue__text">{displayed}</span>
      {!done && <span className="dialogue__caret" aria-hidden>▋</span>}
    </div>
  );
}
