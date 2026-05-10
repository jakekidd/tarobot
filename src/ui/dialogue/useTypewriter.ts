import { useEffect, useRef, useState } from 'react';

export type TypewriterState = {
  displayed: string;
  done: boolean;
  skip: () => void;
};

/**
 * Emit `text` one character at a time with extra pauses on punctuation.
 *
 * Pauses (relative to base charDelayMs):
 *   .  ?  !   → +220-470 ms
 *   —          → +160-300 ms
 *   ,  ;  :    → +90-200 ms
 *
 * Consumers should remount via `key` to retype a new line.
 */
export function useTypewriter(
  text: string,
  charDelayMs: number,
  onChar?: (charCode: number) => void,
  onDone?: () => void,
): TypewriterState {
  const empty = text.length === 0;
  const [displayed, setDisplayed] = useState<string>(empty ? text : '');
  const [done, setDone] = useState<boolean>(empty);
  const indexRef = useRef(0);
  const onCharRef = useRef(onChar);
  const onDoneRef = useRef(onDone);

  useEffect(() => { onCharRef.current = onChar; }, [onChar]);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (empty) {
      onDoneRef.current?.();
      return;
    }
    let stopped = false;
    let timeoutId = 0;

    const tick = () => {
      if (stopped) return;
      indexRef.current += 1;
      const next = text.slice(0, indexRef.current);
      setDisplayed(next);
      const ch = text[indexRef.current - 1] ?? '';
      onCharRef.current?.(ch.charCodeAt(0));

      if (indexRef.current >= text.length) {
        setDone(true);
        onDoneRef.current?.();
        return;
      }

      // Variable delay based on the char we just emitted.
      let delay = charDelayMs;
      if (/[.?!]/.test(ch))            delay += 220 + Math.random() * 250;
      else if (/[—–]/.test(ch))        delay += 160 + Math.random() * 140;
      else if (/[,;:]/.test(ch))       delay += 90  + Math.random() * 110;

      timeoutId = window.setTimeout(tick, delay);
    };

    timeoutId = window.setTimeout(tick, charDelayMs);
    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
    };
  }, [text, charDelayMs, empty]);

  const skip = () => {
    if (done) return;
    setDisplayed(text);
    setDone(true);
    indexRef.current = text.length;
    onDoneRef.current?.();
  };

  return { displayed, done, skip };
}
