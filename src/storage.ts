// Browser-only persistence layer.
//
// Two-layer model:
//   - Person : durable record of someone who's been here. Survives across
//              visits; accumulates history (which questions they answered,
//              which intentions they chose). Created when a visit crosses
//              the save-threshold (3 openers answered).
//   - Session: volatile in-flight container for the CURRENT visit. At
//              most one exists at a time (`active_session`). On survey
//              close it folds into the matching Person and is cleared.
//
// Keys (no version prefix — runtime validation handles schema drift):
//   tarobot:apikey
//   tarobot:people
//   tarobot:active_session
//   tarobot:settings

import type {
  EngineState,
  LivingDoc,
  PickEvent,
  SurveyProfile,
  TimingEvent,
} from './pipeline/survey';

/** Current Person schema version. Bumped to 2 in the survey-engine-v2
 *  refactor (replaces Investigation with LivingDoc). purgeLegacyPersons
 *  drops anything where schema_version !== 2 on app boot. */
export const PERSON_SCHEMA_VERSION = 2 as const;
import type { PersonaId } from './pipeline';
import { DEFAULT_MASCOT_ID, type MascotId } from './ui/scene/mascots';

const K_API_KEY = 'tarobot:apikey';
const K_PEOPLE = 'tarobot:people';
const K_ACTIVE_SESSION = 'tarobot:active_session';
const K_SETTINGS = 'tarobot:settings';

const PEOPLE_CAP = 200;

// ─── API key ────────────────────────────────────────────

export function loadApiKey(): string | null {
  try {
    return localStorage.getItem(K_API_KEY);
  } catch {
    return null;
  }
}
export function saveApiKey(key: string): void {
  localStorage.setItem(K_API_KEY, key.trim());
}
export function clearApiKey(): void {
  localStorage.removeItem(K_API_KEY);
}

// ─── Person (durable record) ────────────────────────────

export type Person = {
  id: string;
  /** Schema version. v2 introduces LivingDoc (replacing the legacy
   *  Investigation). `purgeLegacyPersons` drops anything with a
   *  different version on boot. */
  schema_version: typeof PERSON_SCHEMA_VERSION;
  /** Lowercase first name — the primary match key. Original casing is
   *  preserved in `profile.name`. */
  name: string;
  /** Final post-synthesis SurveyProfile (immutable once saved). */
  profile: SurveyProfile;
  /** Final post-synthesis LivingDoc (scaffold + margin + story + held
   *  probes + coverage). v2 replacement for the legacy Investigation. */
  doc: LivingDoc;
  /** Full picks_log from the survey — the Seer reads this as
   *  surveyHistory in the director payloads. */
  picks_log: PickEvent[];
  /** Optional telemetry log (latency, initial-vs-final picks, z-scores). */
  timing_log?: TimingEvent[];
  /** History of intentions the user has asked (most-recent first).
   *  Each LOAD + new intention prepends here so we can show
   *  "last time you asked: X" hints. */
  intentions: string[];
  created_at: number;
  last_visit_at: number;
};

function loadPeopleRaw(): Person[] {
  try {
    const raw = localStorage.getItem(K_PEOPLE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Person[];
  } catch {
    return [];
  }
}

function writePeople(list: Person[]): void {
  const capped = [...list]
    .sort((a, b) => (b.last_visit_at ?? 0) - (a.last_visit_at ?? 0))
    .slice(0, PEOPLE_CAP);
  localStorage.setItem(K_PEOPLE, JSON.stringify(capped));
}

/** All known People, ordered by most-recent visit first. */
export function listPeople(): Person[] {
  return [...loadPeopleRaw()].sort(
    (a, b) => (b.last_visit_at ?? 0) - (a.last_visit_at ?? 0),
  );
}

export function getPerson(id: string): Person | null {
  return loadPeopleRaw().find((p) => p.id === id) ?? null;
}

/** Returns every Person whose lowercase first-name matches, ordered by
 *  most-recent visit. Empty array means "no prior visits under this name". */
export function findPeopleByName(name: string): Person[] {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  return loadPeopleRaw()
    .filter((p) => p.name === key)
    .sort((a, b) => (b.last_visit_at ?? 0) - (a.last_visit_at ?? 0));
}

/** Upsert by id. Used when folding a closed session into a Person, or
 *  when creating a brand-new Person at the save threshold. */
export function savePerson(person: Person): void {
  const list = loadPeopleRaw();
  const next: Person = { ...person, last_visit_at: Date.now() };
  const idx = list.findIndex((p) => p.id === next.id);
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  writePeople(list);
}

export function deletePerson(id: string): void {
  const list = loadPeopleRaw().filter((p) => p.id !== id);
  writePeople(list);
}

/** All distinct lowercase first names known to storage. Used by the
 *  name-input UI for soft warnings during typing. */
export function listKnownNames(): string[] {
  return Array.from(new Set(loadPeopleRaw().map((p) => p.name)));
}

// ─── Active session (in-flight visit) ───────────────────

export type SessionPhase =
  | 'survey'
  | 'compiling'
  | 'enter-tent'
  | 'tent'
  | 'done';

export type Session = {
  id: string;
  started_at: number;
  last_active_at: number;
  completed_at?: number;
  phase: SessionPhase;
  /** ID of the Person this session is tied to. Set once the user's
   *  name is confirmed (either as a new Person crossing the save
   *  threshold, or as a matched returning Person at the modal). */
  person_id?: string;
  /** Survey engine state snapshot. Storage is opaque — the engine is
   *  the source of truth in-memory; this field is just so the resume
   *  UI can label rows and (eventually) hydrate engine state. */
  engine?: EngineState;
};

export function newSession(): Session {
  const now = Date.now();
  return {
    id: makeId(),
    started_at: now,
    last_active_at: now,
    phase: 'survey',
  };
}

export function loadActiveSession(): Session | null {
  try {
    const raw = localStorage.getItem(K_ACTIVE_SESSION);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveActiveSession(session: Session): void {
  const next: Session = { ...session, last_active_at: Date.now() };
  localStorage.setItem(K_ACTIVE_SESSION, JSON.stringify(next));
}

export function clearActiveSession(): void {
  localStorage.removeItem(K_ACTIVE_SESSION);
}

/** Mark active session done + clear. */
export function completeActiveSession(): void {
  clearActiveSession();
}

// ─── Folding active session into Person ─────────────────

/** Persist a Person record from the post-synthesis engine snapshot.
 *  Called ONCE at end-of-survey (after the final observer pass + algo
 *  extraction land). Save games are immutable from this point — they
 *  exist so the user can reload their survey state and ask a different
 *  intention without re-running the questionnaire. */
export function savePersonFromFinalState(args: {
  profile: SurveyProfile;
  doc: LivingDoc;
  picks_log: PickEvent[];
  timing_log?: TimingEvent[];
}): Person {
  const name = args.profile.name.trim().toLowerCase();
  const now = Date.now();
  const person: Person = {
    id: makeId(),
    schema_version: PERSON_SCHEMA_VERSION,
    name,
    profile: args.profile,
    doc: args.doc,
    picks_log: args.picks_log,
    timing_log: args.timing_log,
    intentions: [],
    created_at: now,
    last_visit_at: now,
  };
  savePerson(person);
  return person;
}

/** Record an intention against an existing Person without rewriting
 *  the survey snapshot. Used on each LOAD-and-ask, so we can show
 *  "last time you asked: X" hints. */
export function prependIntentionToPerson(person_id: string, intention: string): void {
  const list = loadPeopleRaw();
  const idx = list.findIndex((p) => p.id === person_id);
  if (idx < 0) return;
  const prior = list[idx]!;
  const intentions = prependUnique(prior.intentions ?? [], intention);
  list[idx] = { ...prior, intentions, last_visit_at: Date.now() };
  writePeople(list);
}

/** Drop any pre-schema-change Persons. v2 records have
 *  `schema_version === PERSON_SCHEMA_VERSION` (== 2) + `doc` +
 *  `picks_log`. v1 records (Investigation-shaped) and pre-v1 records
 *  (no investigation field) all get dropped silently. Called once
 *  from main.tsx at boot. */
export function purgeLegacyPersons(): void {
  const list = loadPeopleRaw();
  const survivors = list.filter(
    (p) =>
      // Cast through unknown so we can probe legacy shapes that lack
      // the schema_version field.
      ((p as unknown as { schema_version?: number }).schema_version === PERSON_SCHEMA_VERSION) &&
      (p as unknown as { doc?: unknown }).doc != null &&
      Array.isArray(p.picks_log),
  );
  if (survivors.length !== list.length) {
    writePeople(survivors);
  }
}

// ─── Settings ───────────────────────────────────────────

export type Settings = {
  soundOn: boolean;
  charDelayMs: number;
  personaId: PersonaId;
  mascotId: MascotId;
};

const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
  charDelayMs: 28,
  personaId: 'mater_tenebris',
  mascotId: DEFAULT_MASCOT_ID,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(K_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<Settings>): Settings {
  const merged = { ...loadSettings(), ...settings };
  localStorage.setItem(K_SETTINGS, JSON.stringify(merged));
  return merged;
}

// ─── Bulk clear (Settings screen actions) ───────────────

/** Clear all stored data EXCEPT the API key. */
export function clearAllExceptKey(): void {
  localStorage.removeItem(K_PEOPLE);
  localStorage.removeItem(K_ACTIVE_SESSION);
  localStorage.removeItem(K_SETTINGS);
}

/** Full wipe including the API key. */
export function clearAll(): void {
  clearApiKey();
  clearAllExceptKey();
}

// ─── helpers ────────────────────────────────────────────

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function prependUnique(list: string[], value: string): string[] {
  const filtered = list.filter((x) => x !== value);
  return [value, ...filtered];
}
