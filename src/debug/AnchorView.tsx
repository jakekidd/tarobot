// AnchorView — live render of the Subject Anchor the profiler is
// building, with per-section update markers and a short diff-flash when
// a section's content changes between passes.
//
// Renders as the BOTTOM portion of the left debug column (top portion
// = ProfilerWorkspace). Visible only when the DEBUG navbar chip is on
// AND we're in the antechamber phase.

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseAnchorSections } from '../pipeline/antechamber';
import { subscribeAnchor, type AnchorEvent } from './anchorBus';

type Props = { visible: boolean };

const FLASH_MS = 700;

export function AnchorView({ visible }: Props) {
  const [event, setEvent] = useState<AnchorEvent | null>(null);
  /** Per-section "last updated turn" — used for the [✱ T<n>] marker. */
  const [updateMarkers, setUpdateMarkers] = useState<Map<string, number>>(new Map());
  /** Headings currently mid-flash. Render reads ONLY this set; the
   *  wall-clock bookkeeping lives in the ref below so the render path
   *  stays pure (no Date.now(), no ref reads). */
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());
  /** Section heading → flash start ms. Pruned by the fadeout interval. */
  const flashTimes = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return subscribeAnchor((ev) => {
      // Update per-section markers
      setUpdateMarkers((prev) => {
        const next = new Map(prev);
        for (const heading of ev.diff.changed) next.set(heading, ev.turn);
        for (const heading of ev.diff.added) next.set(heading, ev.turn);
        for (const heading of ev.diff.removed) next.delete(heading);
        return next;
      });
      // Start flash for changed + added sections
      const now = Date.now();
      const times = flashTimes.current;
      for (const [k, v] of times) {
        if (now - v >= FLASH_MS) times.delete(k);
      }
      for (const heading of [...ev.diff.changed, ...ev.diff.added]) {
        times.set(heading, now);
      }
      setFlashing(new Set(times.keys()));
      setEvent(ev);
    });
  }, []);

  // Drive the flash fadeout. Cheap: tick every 100ms while any flash
  // is active, then stop until the next anchor event.
  useEffect(() => {
    if (flashing.size === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const times = flashTimes.current;
      for (const [k, v] of times) {
        if (now - v >= FLASH_MS) times.delete(k);
      }
      if (times.size !== flashing.size) setFlashing(new Set(times.keys()));
    }, 100);
    return () => window.clearInterval(timer);
  }, [flashing]);

  const sections = useMemo(() => {
    if (!event) return [];
    return parseAnchorSections(event.anchor);
  }, [event]);

  if (!visible) return null;
  if (!event || !event.anchor.trim()) {
    return (
      <section className="anchor-view anchor-view--empty" aria-label="subject anchor">
        <div className="anchor-view__head">SUBJECT ANCHOR</div>
        <div className="anchor-view__placeholder">
          builds at antechamber close (compiler pass). watch the hypothesis
          list above for live activity.
        </div>
      </section>
    );
  }

  return (
    <section className="anchor-view" aria-label="subject anchor">
      <div className="anchor-view__head">
        SUBJECT ANCHOR
        <span className="anchor-view__head-meta">
          T{event.turn} · {event.trigger}
        </span>
      </div>
      {sections.map((s) => {
        const lastTurn = updateMarkers.get(s.heading);
        return (
          <div
            key={s.heading}
            className={`anchor-view__section${flashing.has(s.heading) ? ' anchor-view__section--flash' : ''}`}
          >
            <div className="anchor-view__section-head">
              <span className="anchor-view__section-title">{s.heading}</span>
              {lastTurn !== undefined && (
                <span className="anchor-view__update-marker">✱ T{lastTurn}</span>
              )}
            </div>
            <div className="anchor-view__section-body">
              {s.content.length > 0 ? s.content : <em className="anchor-view__empty-section">no content yet</em>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
