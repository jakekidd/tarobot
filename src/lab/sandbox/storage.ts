// Sandbox config persistence — localStorage round-trip with a single
// versioned key. Loads return a fresh empty config when no data
// exists or when the stored blob is corrupted/wrong-shape.

import { SANDBOX_STORAGE_KEY, type SandboxConfig } from './types';

const EMPTY: SandboxConfig = {
  agents: {},
  pipeline: [],
  state: [],
};

export function loadSandboxConfig(): SandboxConfig {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(SANDBOX_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY;
    return {
      agents: parsed.agents && typeof parsed.agents === 'object' ? parsed.agents : {},
      pipeline: Array.isArray(parsed.pipeline) ? parsed.pipeline : [],
      state: Array.isArray(parsed.state) ? parsed.state : [],
    };
  } catch {
    return EMPTY;
  }
}

export function saveSandboxConfig(config: SandboxConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* swallow — localStorage full or unavailable. Sandbox still works
     * for this session; persistence is best-effort. */
  }
}
