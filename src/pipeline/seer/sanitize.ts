// Text filters applied to monologue + chat output at the engine layer.
// Stored values pass through these — the AI sees the sanitized text on
// subsequent calls too, not just the user.
//
// Currently:
//   - em-dash (—) and en-dash (–) → " … " (space + Unicode ellipsis + space)
//     (user dislikes the em-dash in dialogue; ellipsis carries the same beat)
//   - any double-spaces produced by the above are collapsed back to single

import type { Monologue } from './types';

const SPACED_ELLIPSIS = '. . .';

export function sanitizeMonologueText(s: string): string {
  if (!s) return s;
  return s
    // em-/en-dash → spaced ellipsis (visual + cadence)
    .replace(/\s*[—–]\s*/g, ` ${SPACED_ELLIPSIS} `)
    // single ellipsis char OR three-or-more periods → spaced ellipsis
    .replace(/…/g, SPACED_ELLIPSIS)
    .replace(/\.{3,}/g, SPACED_ELLIPSIS)
    .replace(/  +/g, ' ')
    .trim();
}

/** Apply text sanitation to a Monologue (text + optional prompt_to_user). */
export function sanitizeMonologue(m: Monologue): Monologue {
  const text = sanitizeMonologueText(m.text);
  const prompt = m.prompt_to_user ? sanitizeMonologueText(m.prompt_to_user) : undefined;
  return prompt ? { text, prompt_to_user: prompt } : { text };
}
