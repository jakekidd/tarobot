import { useEffect } from 'react';
import { useTypewriter } from './useTypewriter';
import { blip } from '../sound/sound';

type Props = {
  text: string;
  charDelayMs?: number;
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
  charDelayMs = 28,
  soundOn = true,
  onTypingChange,
  onDone,
  clickToSkip = true,
}: Props) {
  const { displayed, done, skip } = useTypewriter(
    text,
    charDelayMs,
    soundOn ? (code) => blip(code) : undefined,
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
