// Bench primitive — Stream.
// Auto-scrolling monospace display for thinking traces, logs, etc.
// Pass `text` and it renders preserving newlines, scrolled to bottom
// whenever the content grows.

import { useEffect, useRef } from 'react';

type Props = {
  text: string;
  emptyHint?: string;
  /** Optional override for the max-height. Default is the CSS value
   *  (320px). Numbers are interpreted as px. */
  maxHeight?: number;
};

export function Stream({ text, emptyHint, maxHeight }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text]);

  const isEmpty = !text || text.trim().length === 0;
  const cls = `bench__stream ${isEmpty ? 'bench__stream--empty' : ''}`;
  const style = maxHeight !== undefined ? { maxHeight: `${maxHeight}px` } : undefined;
  return (
    <div ref={ref} className={cls} style={style}>
      {isEmpty ? (emptyHint ?? '(empty)') : text}
    </div>
  );
}
