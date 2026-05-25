// Apply a profiler pass's hypothesis_edits to doc.held. Pure function —
// returns the new Probe[] array; caller wraps in setState.
//
// Edit semantics:
//   add      append a new Probe. id collision = silently skip (the
//            profiler is expected to use stable ids; collision is
//            usually a re-emit and shouldn't clobber).
//   promote  set status (+ confidence + evidence_refs if provided)
//            on an existing id. unknown id = skip with warning.
//   refine   rewrite claim + set status (default
//            'refined_by_correction') + optional confidence /
//            evidence_refs. unknown id = skip with warning.
//   refute   set status='refuted'. kept in held so the compiler
//            sees what was tried.
//   drop     remove from held entirely. unknown id = skip.

import type { HypothesisEdit } from './schema';
import type { Probe } from '../../living-doc';

export function applyHypothesisEdits(
  held: readonly Probe[],
  edits: readonly HypothesisEdit[],
  /** Current post-opener turn. New probes get born_turn = this. */
  current_turn: number,
): { next: Probe[]; raised: string[]; dropped: string[] } {
  const next = new Map<string, Probe>(held.map((p) => [p.id, p]));
  const raised: string[] = [];
  const dropped: string[] = [];

  for (const edit of edits) {
    if (edit.op === 'add') {
      if (next.has(edit.id)) continue; // silent skip on collision
      next.set(edit.id, {
        id: edit.id,
        claim: edit.claim,
        source: 'profiler',
        status: edit.status,
        confidence: edit.confidence,
        evidence_refs: edit.evidence_refs,
        born_turn: current_turn,
        age_in_turns: 0,
      });
      raised.push(`${edit.id}: ${edit.claim}`);
      continue;
    }

    const existing = next.get(edit.id);
    if (!existing) {
      console.warn(`[profiler] edit op=${edit.op} for unknown id '${edit.id}' — skipped`);
      continue;
    }

    if (edit.op === 'promote') {
      next.set(edit.id, {
        ...existing,
        status: edit.status,
        confidence: edit.confidence ?? existing.confidence,
        evidence_refs: edit.evidence_refs ?? existing.evidence_refs,
      });
      raised.push(`${edit.id} → ${edit.status}`);
    } else if (edit.op === 'refine') {
      next.set(edit.id, {
        ...existing,
        claim: edit.claim,
        status: edit.status,
        confidence: edit.confidence ?? existing.confidence,
        evidence_refs: edit.evidence_refs ?? existing.evidence_refs,
      });
      raised.push(`${edit.id} refined: ${edit.claim}`);
    } else if (edit.op === 'refute') {
      next.set(edit.id, { ...existing, status: 'refuted' });
      dropped.push(`${edit.id}: refuted`);
    } else if (edit.op === 'drop') {
      next.delete(edit.id);
      dropped.push(`${edit.id}: dropped`);
    }
  }

  return { next: Array.from(next.values()), raised, dropped };
}
