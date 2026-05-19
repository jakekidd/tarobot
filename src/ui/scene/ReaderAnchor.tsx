import { useEffect, useRef } from 'react';
import { setAnchor } from './anchorStore';

type Props = {
  /** Square size in CSS pixels — defines how big the cat renders here. */
  size?: number;
};

/**
 * Invisible placeholder div. Reports its bounding box to the anchor
 * store. The full-screen Three.js scene reads this and renders the cat
 * at this position, at this size. Lets us position the cat as if he were
 * a regular layout element, while the canvas spans the viewport.
 */
export function ReaderAnchor({ size = 240 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setAnchor({
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        width: r.width,
        height: r.height,
      });
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      setAnchor(null);
    };
  }, [size]);

  return (
    <div
      ref={ref}
      className="reader-anchor"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
