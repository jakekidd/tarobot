// Returning-user lookup. Operates on the Person record (durable, multi-
// visit) rather than the volatile Session. The Survey UI calls
// findPeopleMatchingName() after Q1 to decide whether to show the
// RESUME / START FRESH modal.

import { findPeopleByName, type Person, type VisitRecord } from '../../storage';
import type { SurveyProfile } from './types';

export type ReturningMatch = {
  person_id: string;
  profile: SurveyProfile;
  /** Most-recent visit timestamp, for ordering + display. */
  last_visit_at: number;
  /** Question ids the person has already answered across all visits. */
  answered_node_ids: string[];
  /** Most-recent-first list of prior intentions. */
  prior_intentions: string[];
  /** Free-form summary string for the modal (e.g. "leo · last seen May 3"). */
  display_summary: string;
};

/** Find returning candidates matching a first name. Returns empty when
 *  there are no prior visits. The UI distinguishes single-match (binary
 *  RESUME/FRESH modal) vs multi-match (disambiguator) based on length. */
export function findPeopleMatchingName(name: string): ReturningMatch[] {
  return findPeopleByName(name).map(toMatch);
}

/** Project a Person into the fields a new SurveyProfile needs to start
 *  mid-engine. Used when the user confirms RESUME. The engine will
 *  skip openers for any fields already populated here. */
export function seedFromPerson(person: Person): Partial<SurveyProfile> {
  return {
    name: person.profile.name,
    birthday: person.profile.birthday,
    sun_sign: person.profile.sun_sign,
    life_path: person.profile.life_path,
    birth_card: person.profile.birth_card,
    age_bracket: person.profile.age_bracket,
    birth_time_bracket: person.profile.birth_time_bracket,
    // Don't carry initial_intention across visits — each visit asks its
    // own question. prior_intentions on the engine state is the history.
    // sections + cast are NOT pre-seeded — they'll be re-observed fresh.
    // The accumulated history of answered_node_ids carries the dedupe
    // separately (not part of the profile).
  };
}

// ─── helpers ─────────────────────────────────────────────

function toMatch(person: Person): ReturningMatch {
  return {
    person_id: person.id,
    profile: person.profile,
    last_visit_at: person.last_visit_at,
    answered_node_ids: [...person.history.answered_node_ids],
    prior_intentions: [...person.history.intentions],
    display_summary: buildSummary(person),
  };
}

function buildSummary(person: Person): string {
  const parts: string[] = [];
  if (person.profile.sun_sign) parts.push(person.profile.sun_sign);
  const last = mostRecentVisit(person.history.visits);
  if (last) {
    const d = new Date(last.completed_at ?? last.started_at);
    parts.push(`last seen ${d.toLocaleDateString()}`);
  }
  return parts.join(' · ');
}

function mostRecentVisit(visits: VisitRecord[]): VisitRecord | null {
  return visits[0] ?? null;
}
