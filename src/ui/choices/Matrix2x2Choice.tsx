import { useState, type MouseEvent as RMouseEvent } from 'react';
import { fireImpact } from '../scene/impactStore';

// Mirror the animation timing used by MultipleChoice so the visual language
// is identical: others fade, picked flashes + bursts, beacon emerges, advance.
const PICK_ANIMATION_MS = 420;
const BEACON_DELAY_MS = 220;

type Props = {
  /** Axis labels — x[0] = left, x[1] = right, y[0] = top, y[1] = bottom. */
  axes: { x: [string, string]; y: [string, string] };
  /** Options in the matrix order [TL, TR, BL, BR]. */
  options: string[];
  onPick: (value: string) => void;
};

/**
 * Custom picker for questions whose answers map to a 2D plane. Renders a
 * square crosshair-divided grid with axis labels at the four edges; the user
 * picks a quadrant. More intuitive than four standalone buttons because the
 * spatial layout *is* the data structure.
 */
export function Matrix2x2Choice({ axes, options, onPick }: Props) {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function handlePick(idx: number, e: RMouseEvent<HTMLButtonElement>) {
    if (pickedIdx !== null) return;
    setPickedIdx(idx);
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2;
    const y = e.clientY || r.top + r.height / 2;
    window.setTimeout(() => fireImpact({ x, y }), BEACON_DELAY_MS);
    window.setTimeout(() => onPick(options[idx] ?? ''), PICK_ANIMATION_MS);
  }

  const cellClass = (i: number): string => {
    const base = 'matrix-2x2__cell';
    if (pickedIdx === i) return `${base} ${base}--picked`;
    if (pickedIdx !== null) return `${base} ${base}--unpicked`;
    if (hoverIdx === i) return `${base} ${base}--hover`;
    return base;
  };

  const labels = [
    options[0] ?? `${axes.x[0]} · ${axes.y[0]}`,   // TL
    options[1] ?? `${axes.x[1]} · ${axes.y[0]}`,   // TR
    options[2] ?? `${axes.x[0]} · ${axes.y[1]}`,   // BL
    options[3] ?? `${axes.x[1]} · ${axes.y[1]}`,   // BR
  ];

  return (
    <div className="matrix-2x2" role="radiogroup" aria-label="2-axis picker">
      <div className="matrix-2x2__label matrix-2x2__label--top">{axes.y[0].toLowerCase()}</div>
      <div className="matrix-2x2__label matrix-2x2__label--left">{axes.x[0].toLowerCase()}</div>
      <div className="matrix-2x2__plane">
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            className={cellClass(i)}
            disabled={pickedIdx !== null}
            onClick={(e) => handlePick(i, e)}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() =>
              setHoverIdx((cur) => (cur === i ? null : cur))
            }
            aria-label={labels[i]}
          >
            <span className="matrix-2x2__cell-text">{labels[i]?.toLowerCase()}</span>
          </button>
        ))}
        {/* Crosshair sits above the cells, ignores clicks. */}
        <div className="matrix-2x2__crosshair" aria-hidden />
      </div>
      <div className="matrix-2x2__label matrix-2x2__label--right">{axes.x[1].toLowerCase()}</div>
      <div className="matrix-2x2__label matrix-2x2__label--bottom">{axes.y[1].toLowerCase()}</div>
    </div>
  );
}
