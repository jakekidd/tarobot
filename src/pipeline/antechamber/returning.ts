// Returning-user lookup. Used by the Antechamber UI to detect when a typed
// name matches an existing Person record so we can offer LOAD vs START
// FRESH. The match carries the full saved Person — the LOAD path
// hydrates the engine directly from it via engine.loadFromSave().
//
// v2: Person.investigation → Person.doc (LivingDoc).

import { findPeopleByName, type Person } from '../../storage';
import type { PickEvent, AntechamberProfile, TimingEvent, VerbatimEntry } from './types';
import type { LivingDoc } from './living-doc';

export type ReturningMatch = {
  person_id: string;
  profile: AntechamberProfile;
  /** Final post-synthesis snapshot — needed for the LOAD path. */
  doc: LivingDoc;
  /** v3: markdown anchor written by the profiler. Empty for legacy saves. */
  anchor: string;
  /** v3: immutable verbatim log of free-text user inputs. */
  verbatim_log: VerbatimEntry[];
  picks_log: PickEvent[];
  timing_log?: TimingEvent[];
  /** History of past intentions, most-recent first. */
  prior_intentions: string[];
  /** Most-recent visit timestamp, for ordering + display. */
  last_visit_at: number;
  /** Free-form summary string for the modal (e.g. "leo · last seen May 3"). */
  display_summary: string;
};

/** Find returning candidates matching a first name. Returns empty when
 *  there are no prior saves. The UI distinguishes single-match vs
 *  multi-match based on the array length. */
export function findPeopleMatchingName(name: string): ReturningMatch[] {
  return findPeopleByName(name).map(toMatch);
}

// ─── helpers ─────────────────────────────────────────────

function toMatch(person: Person): ReturningMatch {
  return {
    person_id: person.id,
    profile: person.profile,
    doc: person.doc,
    anchor: person.anchor ?? '',
    verbatim_log: [...(person.verbatim_log ?? [])],
    picks_log: person.picks_log,
    timing_log: person.timing_log,
    prior_intentions: [...(person.intentions ?? [])],
    last_visit_at: person.last_visit_at,
    display_summary: buildSummary(person),
  };
}

function buildSummary(person: Person): string {
  const parts: string[] = [];
  if (person.profile.sun_sign) parts.push(person.profile.sun_sign);
  parts.push(`last seen ${new Date(person.last_visit_at).toLocaleDateString()}`);
  return parts.join(' · ');
}
