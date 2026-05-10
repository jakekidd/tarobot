import { useEffect, useState } from 'react';

const FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'.split('');

type Props = {
  label?: string;
  speedMs?: number;
};

/** Braille-block terminal spinner. Sits inline with optional label text. */
export function Spinner({ label, speedMs = 80 }: Props) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setI((x) => (x + 1) % FRAMES.length),
      speedMs,
    );
    return () => window.clearInterval(id);
  }, [speedMs]);
  return (
    <span className="spinner" aria-live="polite" aria-label={label ?? 'loading'}>
      <span className="spinner__glyph">{FRAMES[i]}</span>
      {label && <span className="spinner__label">{label}</span>}
    </span>
  );
}
