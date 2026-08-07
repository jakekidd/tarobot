// The preshow — the scene she was in before the visitor arrived
// (PULSE: "the person was already there before you walked in the
// room"). Hers alone: prepended to her context, never recounted.
// Performance material like the library — echoing its register is
// the point; one rotation is picked per session.

import PRESHOW_RAW from '../../../materials/persona/preshow.md?raw';

const parts = PRESHOW_RAW.split(/\n---\n/)
  .map((s) => s.trim())
  .filter(Boolean);

/** rotations only — the authoring header before the first --- stays out */
export const PRESHOW_ROTATIONS: string[] = parts.slice(1);

export function pickPreshow(): string | null {
  if (PRESHOW_ROTATIONS.length === 0) return null;
  return PRESHOW_ROTATIONS[Math.floor(Math.random() * PRESHOW_ROTATIONS.length)];
}
