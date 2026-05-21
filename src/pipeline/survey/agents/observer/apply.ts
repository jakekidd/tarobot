// Observer apply — fold a validated ObserverOutput into the engine's
// SurveyProfile state.
//
// What this does NOT touch: hypotheses (the engine applies
// out.hypothesis_ladder_moves separately via applyLadderMoves from
// shared.ts, since both observer AND detective emit ladder moves and
// the routing is the same).
//
// Section-by-section body merge guards against a single bad observer
// turn (drops ## tensions entirely) wiping the whole document. The
// observer can omit a section without losing it from the doc; the
// next turn's emission replaces section content if non-empty.

import type { SurveyProfile, ObserverOutput } from '../../types';

export type { ObserverOutput };

/** The 9 canonical profile-body section headers. The observer is
 *  instructed to preserve these literally; we re-emit them in order
 *  on every merge so the body's structure is invariant. */
export const REQUIRED_PROFILE_SECTIONS = [
  'self', 'history', 'relationships', 'joys',
  'fears', 'insecurities', 'yearnings', 'now', 'tensions',
] as const;

/** Parse a body into a map of section_name → content. Splits on `## name`
 *  headers; content is everything until the next `## ` or EOF. */
export function splitBodyIntoSections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^##\s+(\S+)\s*\n([\s\S]*?)(?=^##\s+|$(?![\r\n]))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.set(m[1]!.toLowerCase(), m[2] ?? '');
  }
  return out;
}

/** Merge the observer's new body with the prior body section-by-section.
 *  For each required section: prefer new's content if non-empty, else
 *  fall back to prior. Always emits all 9 headers in canonical order. */
export function mergeBodySections(prior: string, next: string): string {
  const priorSections = splitBodyIntoSections(prior);
  const nextSections = splitBodyIntoSections(next);
  const lines: string[] = ['# Profile', ''];
  for (const section of REQUIRED_PROFILE_SECTIONS) {
    const nextContent = (nextSections.get(section) ?? '').trim();
    const priorContent = (priorSections.get(section) ?? '').trim();
    const content = nextContent || priorContent;
    lines.push(`## ${section}`, '');
    if (content) lines.push(content, '');
  }
  return lines.join('\n');
}

/** Apply v2 observer output to profile.
 *
 *  - profile.body merged section-by-section (see mergeBodySections).
 *  - hooks / edges / side_channel REPLACED with the observer's
 *    full-emit arrays (the observer emits the full desired state each
 *    turn; engine doesn't merge — observer integrates manually).
 *    Note: end-of-survey algoExtract overrides hooks + side_channel
 *    afterward, so any per-turn observer noise here gets stomped on
 *    the way out.
 *  - cast notes merged by label: for each { label, notes } update,
 *    find the matching CastMember and set its `notes` field.
 *  - Hypothesis ladder NOT touched here — engine applies ladder moves
 *    separately via shared.applyLadderMoves. */
export function applyObserverOutput(profile: SurveyProfile, out: ObserverOutput): SurveyProfile {
  const castNotesByLabel = new Map(out.cast_notes_updates.map((u) => [u.label, u.notes]));
  const nextCast = profile.cast.map((m) => {
    const notes = castNotesByLabel.get(m.label);
    return notes !== undefined ? { ...m, notes } : m;
  });
  const nextBody = mergeBodySections(profile.body, out.profile_body);
  return {
    ...profile,
    body: nextBody,
    hooks: out.hooks,
    edges: out.edges,
    side_channel: out.side_channel,
    cast: nextCast,
  };
}
