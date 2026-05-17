// Text filters applied to monologue + chat output at the engine layer.
// Stored values pass through these — the AI sees the sanitized text on
// subsequent calls too, not just the user.
//
// Currently:
//   - em-dash (—) and en-dash (–) → " … " (space + Unicode ellipsis + space)
//     (user dislikes the em-dash in dialogue; ellipsis carries the same beat)
//   - any double-spaces produced by the above are collapsed back to single

const ELLIPSIS = '…';        // …

export function sanitizeMonologueText(s: string): string {
  if (!s) return s;
  return s
    .replace(/\s*[—–]\s*/g, ` ${ELLIPSIS} `)
    .replace(/  +/g, ' ')
    .trim();
}
