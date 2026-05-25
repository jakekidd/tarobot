// HypothesisView — live render of the profiler's curated hypothesis
// list. v3.2 visible-thinking surface — replaces the old prose-anchor
// evolution since the profiler doesn't write prose anymore. The
// anchor only crystallizes at survey close (via the compiler), so
// this is THE diagnostic during the survey: what's the profiler
// tracking, which hypotheses have been confirmed, refuted, refined?
//
// Renders in the middle of the left debug column. Survey-phase only.
// Sort order: refined_by_correction → confirmed → probing → untested
// → refuted. Status colors mirror v3 conventions (green=confirmed,
// orange=refined-by-correction, violet=probing/untested, muted=
// refuted).

import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeHypotheses, type HypothesisSnapshot } from './hypothesisBus';
import type { Probe, ProbeStatus } from '../pipeline/survey';

type Props = { visible: boolean };

const FLASH_MS = 700;

const STATUS_RANK: Record<ProbeStatus, number> = {
  refined_by_correction: 0,
  confirmed: 1,
  probing: 2,
  untested: 3,
  refuted: 4,
  dropped: 5,
};

export function HypothesisView({ visible }: Props) {
  const [snapshot, setSnapshot] = useState<HypothesisSnapshot | null>(null);
  /** Per-id flash bookkeeping. */
  const [flashTimes, setFlashTimes] = useState<Map<string, number>>(new Map());
  const lastTurnRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return subscribeHypotheses((snap) => {
      // Update per-id "last touched turn" markers
      const next = new Map(lastTurnRef.current);
      for (const id of snap.raised_ids) next.set(id, snap.turn);
      for (const id of snap.dropped_ids) next.set(id, snap.turn);
      lastTurnRef.current = next;
      // Start flash for raised + dropped
      const now = Date.now();
      const flashNext = new Map<string, number>();
      for (const [k, v] of flashTimes) {
        if (now - v < FLASH_MS) flashNext.set(k, v);
      }
      for (const id of [...snap.raised_ids, ...snap.dropped_ids]) {
        flashNext.set(id, now);
      }
      setFlashTimes(flashNext);
      setSnapshot(snap);
    });
  }, [flashTimes]);

  // Tick flash fadeout
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

  const sorted = useMemo(() => sortHypotheses(snapshot?.list ?? []), [snapshot]);

  if (!visible) return null;
  if (!snapshot || sorted.length === 0) {
    return (
      <section className="hypothesis-view hypothesis-view--empty" aria-label="hypotheses">
        <div className="hypothesis-view__head">HYPOTHESES</div>
        <div className="hypothesis-view__placeholder">
          waiting for the profiler's first pass…
        </div>
      </section>
    );
  }

  const now = Date.now();
  return (
    <section className="hypothesis-view" aria-label="hypotheses">
      <div className="hypothesis-view__head">
        HYPOTHESES
        <span className="hypothesis-view__head-meta">
          {sorted.length} · T{snapshot.turn}
        </span>
      </div>
      <ul className="hypothesis-view__list">
        {sorted.map((h) => {
          const flashStart = flashTimes.get(h.id);
          const flashing = flashStart !== undefined && now - flashStart < FLASH_MS;
          const lastTurn = lastTurnRef.current.get(h.id);
          const status = h.status ?? 'untested';
          return (
            <li
              key={h.id}
              className={`hypothesis-view__item hypothesis-view__item--${status}${flashing ? ' hypothesis-view__item--flash' : ''}`}
            >
              <div className="hypothesis-view__item-head">
                <span className={`hypothesis-view__badge hypothesis-view__badge--${status}`}>
                  {statusLabel(status)}
                </span>
                <span className="hypothesis-view__id">{h.id}</span>
                {lastTurn !== undefined && (
                  <span className="hypothesis-view__turn">T{lastTurn}</span>
                )}
              </div>
              <div className="hypothesis-view__claim">{h.claim}</div>
              {(h.evidence_refs?.length ?? 0) > 0 && (
                <div className="hypothesis-view__evidence">
                  evidence: {(h.evidence_refs ?? []).join(', ')}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function sortHypotheses(list: readonly Probe[]): readonly Probe[] {
  return [...list].sort((a, b) => {
    const sa = STATUS_RANK[a.status ?? 'untested'];
    const sb = STATUS_RANK[b.status ?? 'untested'];
    if (sa !== sb) return sa - sb;
    // Within same status: newer (higher born_turn) first
    return (b.born_turn ?? 0) - (a.born_turn ?? 0);
  });
}

function statusLabel(s: ProbeStatus): string {
  switch (s) {
    case 'refined_by_correction': return 'refined';
    case 'confirmed':             return 'confirmed';
    case 'probing':               return 'probing';
    case 'untested':              return 'untested';
    case 'refuted':               return 'refuted';
    case 'dropped':               return 'dropped';
  }
}
