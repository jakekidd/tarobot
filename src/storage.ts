import type {
  EngineState,
  PersonaId,
  Profile,
  Question,
  Survey,
} from './pipeline';

// Browser-only persistence layer. Sits OUTSIDE src/pipeline/ so the
// pipeline lib stays Node-portable.

const NS = 'tarobot:v3';
const K_API_KEY = `${NS}:apikey`;
const K_SESSIONS = `${NS}:sessions`;          // array of in-progress + completed sessions
const K_SETTINGS = `${NS}:settings`;
const SESSIONS_CAP = 50;

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

// ─── Sessions ───────────────────────────────────────────

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
  survey?: Survey;
  profile?: Profile;
  openers?: Question[];
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

/** Load all stored sessions, ordered by last_active_at desc. */
export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(K_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as Session[])
      .slice()
      .sort((a, b) => (b.last_active_at ?? 0) - (a.last_active_at ?? 0));
  } catch {
    return [];
  }
}

function writeSessions(list: Session[]): void {
  const capped = list.slice(0, SESSIONS_CAP);
  localStorage.setItem(K_SESSIONS, JSON.stringify(capped));
}

/** Upsert by id, stamping last_active_at = now. */
export function saveSession(session: Session): void {
  const list = loadSessions();
  const next: Session = { ...session, last_active_at: Date.now() };
  const idx = list.findIndex((s) => s.id === next.id);
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  writeSessions(list);
}

export function deleteSession(id: string): void {
  const list = loadSessions().filter((s) => s.id !== id);
  writeSessions(list);
}

export function getSession(id: string): Session | null {
  return loadSessions().find((s) => s.id === id) ?? null;
}

/** In-progress sessions only — the resume candidates. */
export function listResumable(): Session[] {
  return loadSessions().filter((s) => s.phase !== 'done');
}

/** Most recently touched in-progress session, if any. */
export function loadMostRecent(): Session | null {
  return listResumable()[0] ?? null;
}

/** Mark a session as done and keep it around as a completed entry. */
export function completeSession(session: Session): void {
  const next: Session = { ...session, phase: 'done', completed_at: Date.now() };
  saveSession(next);
}

/** Most recent Profile per name across all stored sessions. */
export function listProfilesByName(): Profile[] {
  type Entry = { profile: Profile; ts: number };
  const byKey = new Map<string, Entry>();
  for (const s of loadSessions()) {
    if (!s.profile) continue;
    const ts = s.last_active_at ?? s.started_at ?? 0;
    const name = s.profile.identity.name?.trim().toLowerCase();
    if (!name) continue;
    const prior = byKey.get(name);
    if (!prior || prior.ts < ts) byKey.set(name, { profile: s.profile, ts });
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.ts - a.ts)
    .map((e) => e.profile);
}

// ─── Settings ───────────────────────────────────────────

export type Settings = {
  soundOn: boolean;
  charDelayMs: number;
  personaId: PersonaId;
};

const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
  charDelayMs: 28,
  personaId: 'mater_tenebris',
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

/** Clear all session data EXCEPT the API key. */
export function clearAllExceptKey(): void {
  localStorage.removeItem(K_SESSIONS);
  localStorage.removeItem(K_SETTINGS);
}

/** Full wipe including the API key. */
export function clearAll(): void {
  clearApiKey();
  localStorage.removeItem(K_SESSIONS);
  localStorage.removeItem(K_SETTINGS);
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
