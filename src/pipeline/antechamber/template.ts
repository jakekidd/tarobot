// Profile template loader.
//
// `materials/templates/profile.md` is the observer's scaffold: 9
// section headers with HTML-comment instructions per section telling
// the observer what to file under each. The engine initializes
// `state.profile.body` with the RAW template (instructions visible).
// The observer rewrites it each turn, replacing instruction comments
// with filed observations.
//
// Two exports:
//   - PROFILE_TEMPLATE_RAW    has HTML comments; observer reads this
//   - stripHtmlComments(text) helper to clean a body for downstream
//                             consumers (seer reads the stripped body
//                             so any unreplaced instruction comments
//                             don't leak into prose)
//
// Use stripHtmlComments() OPPORTUNISTICALLY when handing the profile
// body to the seer. The engine doesn't pre-strip on state.profile.body
// because the observer needs the raw form to know where instructions
// live as it integrates evidence.

import PROFILE_TEMPLATE_RAW from '../../../materials/templates/profile.md?raw';

export { PROFILE_TEMPLATE_RAW };

/** Strip HTML comments (`<!-- ... -->`) from a markdown string.
 *  Multi-line comments OK. Collapses runs of 3+ newlines into 2
 *  (markdown paragraph break) so stripped output isn't unevenly
 *  spaced. Trims leading / trailing whitespace. */
export function stripHtmlComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The profile template with HTML-comment instructions stripped.
 *  This is the shape the seer sees when the observer has filed
 *  nothing yet (or in unfilled sections of a partially-filled body). */
export const PROFILE_TEMPLATE_STRIPPED = stripHtmlComments(PROFILE_TEMPLATE_RAW);
