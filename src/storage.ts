import type {
  BaseProfile,
  DrawnCards,
  EnrichedProfile,
  InterviewMessage,
  InterviewState,
  Reading,
} from './pipeline';

// Browser-only persistence layer. Sits OUTSIDE src/pipeline/ so the
// pipeline lib stays Node-portable.

const NS = 'tarobot:v1';
const K_API_KEY = `${NS}:apikey`;
const K_ACTIVE = `${NS}:active`;
const K_ARCHIVE = `${NS}:archive`;
const K_SETTINGS = `${NS}:settings`;
const ARCHIVE_CAP = 20;

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
  | 'interview'
  | 'finalizing'
  | 'placement'
  | 'reading'
  | 'closing'
  | 'done';

export type Session = {
  id: string;
  started_at: number;
  completed_at?: number;
  phase: SessionPhase;
  base_profile?: BaseProfile;
  history?: InterviewMessage[];
  interview?: InterviewState;
  profile?: EnrichedProfile;
  drawn?: DrawnCards;
  reading?: Reading;
};

export function newSession(): Session {
  return {
    id: makeId(),
    started_at: Date.now(),
    phase: 'survey',
  };
}

export function loadActive(): Session | null {
  try {
    const raw = localStorage.getItem(K_ACTIVE);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveActive(session: Session): void {
  localStorage.setItem(K_ACTIVE, JSON.stringify(session));
}

export function clearActive(): void {
  localStorage.removeItem(K_ACTIVE);
}

export function archiveActive(session: Session): void {
  const completed: Session = {
    ...session,
    completed_at: Date.now(),
    phase: 'done',
  };
  const list = loadArchive();
  list.unshift(completed);
  // Trim oldest to keep storage from growing forever.
  while (list.length > ARCHIVE_CAP) list.pop();
  localStorage.setItem(K_ARCHIVE, JSON.stringify(list));
  clearActive();
}

export function loadArchive(): Session[] {
  try {
    const raw = localStorage.getItem(K_ARCHIVE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
}

export function clearArchive(): void {
  localStorage.removeItem(K_ARCHIVE);
}

// ─── Settings ───────────────────────────────────────────

export type Settings = {
  soundOn: boolean;
  charDelayMs: number;
};

const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
  charDelayMs: 28,
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

// ─── Wholesale wipe (for "clear data" menu) ─────────────

export function clearAll(): void {
  clearApiKey();
  clearActive();
  clearArchive();
  localStorage.removeItem(K_SETTINGS);
}

// ─── Helpers ────────────────────────────────────────────

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
