// AnchorView — live render of the Subject Anchor the profiler is
// building, with per-section update markers and a short diff-flash when
// a section's content changes between passes.
//
// Renders as the BOTTOM portion of the left debug column (top portion
// = ProfilerWorkspace). Visible only when the DEBUG navbar chip is on
// AND we're in the antechamber phase.

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseAnchorSections, type AnchorDiff } from '../pipeline/antechamber';
import { subscribeAnchor, type AnchorEvent } from './anchorBus';

type Props = { visible: boolean };

const FLASH_MS = 700;

export function AnchorView({ visible }: Props) {
  const [event, setEvent] = useState<AnchorEvent | null>(null);
  /** Per-section "last updated turn" — used for the [✱ T<n>] marker. */
  const updateMarkers = useRef<Map<string, number>>(new Map());
  /** Per-section flash bookkeeping — section heading → wall-clock ms
   *  at which the flash started. */
  const [flashTimes, setFlashTimes] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    return subscribeAnchor((ev) => {
      // Update per-section markers
      const next = new Map(updateMarkers.current);
      for (const heading of ev.diff.changed) next.set(heading, ev.turn);
      for (const heading of ev.diff.added) next.set(heading, ev.turn);
      for (const heading of ev.diff.removed) next.delete(heading);
      updateMarkers.current = next;
      // Start flash for changed + added sections
      const now = Date.now();
      const flashNext = new Map<string, number>();
      for (const [k, v] of flashTimes) {
        if (now - v < FLASH_MS) flashNext.set(k, v);
      }
      for (const heading of [...ev.diff.changed, ...ev.diff.added]) {
        flashNext.set(heading, now);
      }
      setFlashTimes(flashNext);
      setEvent(ev);
    });
  }, [flashTimes]);

  // Drive the flash fadeout. Cheap: tick every 100ms while any flash
  // is active, then stop until the next anchor event.
  useEffect(() => {
    if (flashTimes.size === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      let any = false;
      const next = new Map<string, number>();
      for (const [k, v] of flashTimes) {
        if (now - v < FLASH_MS) {
          next.set(k, v);
          any = true;
        }
      }
      if (!any) {
        setFlashTimes(new Map());
        window.clearInterval(timer);
      } else if (next.size !== flashTimes.size) {
        setFlashTimes(next);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [flashTimes]);

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

  const now = Date.now();
  return (
    <section className="anchor-view" aria-label="subject anchor">
      <div className="anchor-view__head">
        SUBJECT ANCHOR
        <span className="anchor-view__head-meta">
          T{event.turn} · {event.trigger}
        </span>
      </div>
      {sections.map((s) => {
        const lastTurn = updateMarkers.current.get(s.heading);
        const flashStart = flashTimes.get(s.heading);
        const flashing = flashStart !== undefined && now - flashStart < FLASH_MS;
        return (
          <div
            key={s.heading}
            className={`anchor-view__section${flashing ? ' anchor-view__section--flash' : ''}`}
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

/** Convenience: pretty-print a diff for inline use elsewhere. */
export function formatDiffSummary(diff: AnchorDiff): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`+${diff.added.length} new`);
  if (diff.changed.length) parts.push(`±${diff.changed.length} changed`);
  if (diff.removed.length) parts.push(`-${diff.removed.length} removed`);
  return parts.length > 0 ? parts.join(', ') : 'no change';
}
