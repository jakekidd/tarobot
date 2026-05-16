// Layout placeholder for the 3D table area. Owns no rendering — just
// publishes its bounding rect (so TarobotScene's perspective camera can
// scissor + viewport its render here) and forwards pointer events to the
// scene's picker.
//
// Sits in the right column of the reading layout. Sized via CSS.

import { useEffect, useRef } from 'react';
import { setTableAnchor } from './tableAnchorStore';
import { pickAt } from './pickService';
import type { SlotName } from './cardSceneStore';

type Props = {
  pickable: boolean;
  onPick: (slot: SlotName) => void;
};

export function TableAnchor({ pickable, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () => {
      const r = el.getBoundingClientRect();
      setTableAnchor({
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      });
    };
    publish();

    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener('scroll', publish, { passive: true });
    window.addEventListener('resize', publish);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', publish);
      window.removeEventListener('resize', publish);
      setTableAnchor(null);
    };
  }, []);

  // Track cursor for the cards-hover cursor style. Card meshes own the
  // visual feedback; this just sets cursor on the div.
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pickable) {
      (e.currentTarget as HTMLDivElement).style.cursor = 'default';
      return;
    }
    const slot = pickAt(e.clientX, e.clientY);
    (e.currentTarget as HTMLDivElement).style.cursor = slot ? 'pointer' : 'default';
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!pickable) return;
    const slot = pickAt(e.clientX, e.clientY);
    if (slot) onPick(slot);
  }

  return (
    <div
      ref={ref}
      className="table-anchor"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      aria-label="tarot table"
    />
  );
}
