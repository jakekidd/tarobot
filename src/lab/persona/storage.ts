// Persona Sandbox persistence — one versioned localStorage key.
//
// Two prompt states are persisted: `working` (the live draft, auto-saved
// on edit) and `committed` (the last commit — the diff baseline). There
// is no version history; just these two, like a single staging area.
// Sample responses are NOT persisted — each run is fresh.

import { DEFAULT_PERSONA_SEED } from './seed';
import { STARTER_SAMPLES, type Sample } from './samples';

export type PersonaModel = 'fast' | 'cognition' | 'deep';

export type PersonaConfig = {
  working: string;
  committed: string;
  model: PersonaModel;
  /** Samples Jade authored in the UI, appended after the starters. */
  customSamples: Sample[];
  /** Starter sample ids she has hidden from the rail. */
  hiddenStarterIds: string[];
};

const KEY = 'tarobot:persona-sandbox';
const MODELS: PersonaModel[] = ['fast', 'cognition', 'deep'];

function fresh(): PersonaConfig {
  return {
    working: DEFAULT_PERSONA_SEED,
    committed: DEFAULT_PERSONA_SEED,
    model: 'cognition',
    customSamples: [],
    hiddenStarterIds: [],
  };
}

export function loadPersonaConfig(): PersonaConfig {
  if (typeof window === 'undefined') return fresh();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return fresh();
    return {
      working: typeof p.working === 'string' ? p.working : DEFAULT_PERSONA_SEED,
      committed: typeof p.committed === 'string' ? p.committed : DEFAULT_PERSONA_SEED,
      model: MODELS.includes(p.model) ? p.model : 'cognition',
      customSamples: Array.isArray(p.customSamples)
        ? p.customSamples.filter(isSample).map((s: Sample) => ({
            ...s,
            tag: typeof s.tag === 'string' && s.tag ? s.tag : 'custom',
            custom: true,
          }))
        : [],
      hiddenStarterIds: Array.isArray(p.hiddenStarterIds)
        ? p.hiddenStarterIds.filter((x: unknown): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return fresh();
  }
}

export function savePersonaConfig(cfg: PersonaConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* swallow — localStorage full or unavailable. Session still works. */
  }
}

/** Starters (minus hidden) followed by Jade's custom samples. */
export function visibleSamples(cfg: PersonaConfig): Sample[] {
  return [
    ...STARTER_SAMPLES.filter((s) => !cfg.hiddenStarterIds.includes(s.id)),
    ...cfg.customSamples,
  ];
}

function isSample(x: unknown): x is Sample {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as Sample).id === 'string' &&
    typeof (x as Sample).quote === 'string'
  );
}
