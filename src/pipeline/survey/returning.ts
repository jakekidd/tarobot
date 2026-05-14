// Returning-user lookup. Reads from local storage to find prior sessions
// matching a name. Disambiguates by (name + birthday) when there are multiple
// Jades. The UI shows a confirm modal when matches are found.

import type { Profile } from '../types';
import { loadSessions } from '../../storage';
import type { SurveyProfile } from './types';

export type ReturningMatch = {
  /** The full legacy Profile from the prior session. */
  profile: Profile;
  /** When that session was last active. Used for sorting. */
  last_seen: number;
  /** Free-form summary string for display in the disambiguator. */
  display_summary: string;
};

/**
 * Find returning-user candidates matching a name (case-insensitive, trimmed).
 * Returns at most one match per (name, birthday) combination — the most-recent
 * session that produced a profile for that combo.
 *
 * Empty array means "first-time user, proceed as new".
 */
export function findReturningUser(name: string): ReturningMatch[] {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return [];

  const sessions = loadSessions();   // already sorted desc by last_active_at
  const byKey = new Map<string, ReturningMatch>();

  for (const s of sessions) {
    if (!s.profile?.identity.name) continue;
    const sessionName = s.profile.identity.name.trim().toLowerCase();
    if (sessionName !== trimmed) continue;

    const birthdayKey =
      s.profile.identity.birth_date ??
      s.profile.identity.birth_month_day ??
      'unknown';
    const key = `${sessionName}::${birthdayKey}`;
    if (byKey.has(key)) continue;   // we iterate desc, keep the first (most recent)

    byKey.set(key, {
      profile: s.profile,
      last_seen: s.last_active_at ?? s.started_at,
      display_summary: buildSummary(s.profile, s.last_active_at ?? s.started_at),
    });
  }

  return Array.from(byKey.values());
}

/**
 * Project a legacy Profile (from a prior session) into the fields a new
 * SurveyProfile needs to start mid-engine. Used when the user confirms
 * "yes, that was me" on the returning-user modal.
 */
export function seedFromReturning(match: ReturningMatch): Partial<SurveyProfile> {
  const id = match.profile.identity;
  return {
    name: id.name?.trim() ?? '',
    sun_sign: id.sun_sign ?? null,
    life_path: id.life_path ?? null,
    birth_card: id.tarot_birth_card ?? null,
    // birthday + birth_time_bracket + has_question_mode aren't on the legacy
    // Profile; the engine treats them as missing and asks if needed. Most
    // returning users won't re-answer birthday since astrology fields are set.
  };
}

// ─── helpers ─────────────────────────────────────────────────

function buildSummary(profile: Profile, ts: number): string {
  const parts: string[] = [];
  const sign = profile.identity.sun_sign;
  if (sign) parts.push(sign);
  const bday = profile.identity.birth_month_day ?? profile.identity.birth_date;
  if (bday) parts.push(bday);
  const date = new Date(ts);
  const dateStr = `${date.toLocaleDateString()}`;
  parts.push(`last seen ${dateStr}`);
  return parts.join(' · ');
}
