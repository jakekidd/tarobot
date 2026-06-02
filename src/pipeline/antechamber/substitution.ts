// Field substitution for question text + preambles. {field} tokens are replaced
// with profile values at render time. Fallback-aware so a missing field never
// produces an awkward mid-sentence empty token.
//
// Two render modes:
//   • substituteOrBlank(text, profile)   → empty fields render as "", whitespace cleaned. Use for question text — they should still render even if name is unset.
//   • substituteOrNull(text, profile)    → returns null if any required field is missing. Use for preambles, which we drop entirely rather than render partially.

import type { AntechamberProfile } from './types';

const TOKEN_RE = /\{([a-z_]+)\}/g;

/** Returns the set of unique {field} tokens referenced by the text. */
export function requiredFields(text: string): string[] {
  const out: string[] = [];
  text.replace(TOKEN_RE, (_match, name: string) => {
    if (!out.includes(name)) out.push(name);
    return '';
  });
  return out;
}

/** True if every {field} token in the text has a populated value in profile. */
export function hasAllRequiredFields(text: string, profile: AntechamberProfile): boolean {
  return requiredFields(text).every((f) => hasField(profile, f));
}

/**
 * Substitute every {field} token in `text` with the profile value.
 * Missing fields render as empty strings; redundant whitespace and dangling
 * punctuation are cleaned up so the result reads naturally.
 *
 * Example: "where are you tonight, {name}?" with no name → "where are you tonight?"
 */
export function substituteOrBlank(text: string, profile: AntechamberProfile): string {
  const replaced = text.replace(TOKEN_RE, (_match, name: string) => formatField(profile, name));
  return cleanWhitespace(replaced);
}

/**
 * Substitute every {field} in `text` with the profile value, returning null
 * if any required field is missing on the profile. Useful for preambles —
 * we'd rather drop a preamble than render it half-empty.
 */
export function substituteOrNull(text: string, profile: AntechamberProfile): string | null {
  if (!hasAllRequiredFields(text, profile)) return null;
  const replaced = text.replace(TOKEN_RE, (_match, name: string) => formatField(profile, name));
  return cleanWhitespace(replaced);
}

// ─── helpers ─────────────────────────────────────────────────

function hasField(profile: AntechamberProfile, field: string): boolean {
  switch (field) {
    case 'name':        return Boolean(profile.name?.trim());
    case 'sun_sign':    return Boolean(profile.sun_sign);
    case 'life_path':   return profile.life_path != null;
    case 'birth_card':  return profile.birth_card != null;
    case 'age_bracket': return Boolean(profile.age_bracket);
    default:            return false;
  }
}

function formatField(profile: AntechamberProfile, field: string): string {
  switch (field) {
    case 'name':        return profile.name?.trim() ?? '';
    case 'sun_sign':    return profile.sun_sign ?? '';
    case 'life_path':   return profile.life_path != null ? String(profile.life_path) : '';
    case 'birth_card':  return profile.birth_card?.name ?? '';
    case 'age_bracket': return profile.age_bracket ?? '';
    default:            return '';
  }
}

/**
 * Strip artifacts from substitution: ", ?" → "?", "  " → " ", trailing " ,",
 * leading whitespace, etc. Conservative — only fixes obvious damage.
 */
function cleanWhitespace(text: string): string {
  return text
    .replace(/\s+,/g, ',')         // " ," → ","
    .replace(/,\s*([?.!])/g, '$1') // ", ?" → "?"
    .replace(/\s{2,}/g, ' ')       // collapse runs of whitespace
    .replace(/\s+$/g, '')          // trim end
    .replace(/^\s+/, '');          // trim start
}
