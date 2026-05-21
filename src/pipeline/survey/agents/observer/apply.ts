// Observer apply — fold an ObserverDelta into the LivingDoc.
//
// Mutations:
//   - axes_updates: REPLACE per-key in doc.scaffold.axes
//   - cast_updates: REPLACE per-label in doc.scaffold.cast_notes
//   - tells: APPEND to doc.scaffold.tells, cap at TELLS_CAP
//   - margin_append: APPEND one entry to doc.margin (if non-empty),
//     cap at MARGIN_CAP (oldest-evict)
//   - temporal_lean: REPLACE if provided (including null)
//   - probe_elevate: DROP matching probes from doc.held; add their
//     claim to axes_updates under a generated key (or pre-existing
//     key if observer specified)
//   - probe_refute: DROP matching probes from doc.held
//
// Always bumps doc.v.

import type { LivingDoc } from '../../living-doc';
import { MARGIN_CAP, TELLS_CAP } from '../../living-doc';
import type { ObserverDelta } from './schema';

/** Apply an observer delta to the doc. Returns a new LivingDoc with
 *  doc.v bumped. Stale-check happens at the engine call site (engine
 *  checks delta.based_on_v against current doc.v before calling). */
export function applyObserverDelta(doc: LivingDoc, delta: ObserverDelta): LivingDoc {
  // Axes: replace per key.
  const nextAxes = { ...doc.scaffold.axes };
  for (const [key, value] of Object.entries(delta.axes_updates)) {
    if (value.trim().length === 0) {
      // Empty value means "clear this axis."
      delete nextAxes[key];
    } else {
      nextAxes[key] = value;
    }
  }

  // Cast notes: replace per label.
  const nextCastNotes = { ...doc.scaffold.cast_notes };
  for (const u of delta.cast_updates) {
    if (u.notes.trim().length === 0) {
      delete nextCastNotes[u.label];
    } else {
      nextCastNotes[u.label] = u.notes;
    }
  }

  // Tells: append + cap (oldest-evict).
  const allTells = [...doc.scaffold.tells, ...delta.tells.filter((t) => t.trim().length > 0)];
  const nextTells = allTells.slice(-TELLS_CAP);

  // Margin: append one entry if non-empty + cap.
  const trimmedMargin = delta.margin_append.trim();
  const allMargin = trimmedMargin.length > 0
    ? [...doc.margin, trimmedMargin]
    : doc.margin;
  const nextMargin = allMargin.slice(-MARGIN_CAP);

  // Temporal lean: replace if delta carries it (including null = reset).
  const nextTemporalLean = delta.temporal_lean !== undefined
    ? delta.temporal_lean
    : doc.scaffold.temporal_lean;

  // Held probes: drop elevated + refuted.
  const dropIds = new Set([...delta.probe_elevate, ...delta.probe_refute]);
  const nextHeld = doc.held.filter((p) => !dropIds.has(p.id));

  // Elevated probes' claims become axes (under a generated key, since
  // the observer-chosen axis name was supplied via axes_updates if
  // they wanted to be specific).
  const elevatedAxes: Record<string, string> = {};
  for (const id of delta.probe_elevate) {
    const probe = doc.held.find((p) => p.id === id);
    if (probe && !(`probe_${id}` in nextAxes)) {
      elevatedAxes[`probe_${id}`] = probe.claim;
    }
  }

  return {
    ...doc,
    v: doc.v + 1,
    scaffold: {
      ...doc.scaffold,
      axes: { ...nextAxes, ...elevatedAxes },
      cast_notes: nextCastNotes,
      tells: nextTells,
      temporal_lean: nextTemporalLean,
    },
    margin: nextMargin,
    held: nextHeld,
  };
}
