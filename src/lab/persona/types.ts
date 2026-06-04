// Shared UI-state types for the Persona Sandbox (not persisted).

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export type RunState = {
  status: RunStatus;
  /** The seer's response, accumulating while streaming. */
  text: string;
  /** The previous response (before the current run) — drives the
   *  before/after behavioral diff on a re-run. */
  prev?: string;
  /** Wall-clock for the completed run, ms. */
  ms?: number;
  error?: string;
};
