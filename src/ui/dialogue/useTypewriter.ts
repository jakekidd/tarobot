import { useEffect, useRef, useState } from 'react';

export type TypewriterState = {
  displayed: string;
  done: boolean;
  skip: () => void;
};

/**
 * Emit `text` one character at a time. Calling skip() jumps to full text.
 * `onChar` fires for each emitted character (used for sound).
 * `onDone` fires once when typing completes.
 *
 * Consumers must remount via `key` to retype a new line. The hook does NOT
 * reset its internal index on prop changes — that would require setState in
 * an effect body and would be flagged by react-hooks/set-state-in-effect.
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
    const id = window.setInterval(() => {
      indexRef.current += 1;
      const next = text.slice(0, indexRef.current);
      setDisplayed(next);
      const ch = text.charCodeAt(indexRef.current - 1);
      onCharRef.current?.(ch);
      if (indexRef.current >= text.length) {
        window.clearInterval(id);
        setDone(true);
        onDoneRef.current?.();
      }
    }, charDelayMs);
    return () => window.clearInterval(id);
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
