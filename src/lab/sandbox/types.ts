// Sandbox — DIY agent pipeline types.
//
// The sandbox is a tiny visual programming environment: you define
// agents (each with a prompt + inputs + output), drop them onto a
// pipeline in order, declare state variables, set initial values,
// hit RUN. Strictly serial, left-to-right. No parsers, no conditional
// branching, no parallelism. Output is opaque text written to the
// agent's named output variable.

import type { ModelTier } from '../../pipeline/llm/adapter';

/** A single agent in the sandbox inventory or pipeline.
 *
 *  The agent's prompt is the system prompt sent to the model. Inputs
 *  are state variable names — the runner builds a labelled user
 *  message by stringifying the current values of each input. Output
 *  is one state variable name — whatever the model returns is
 *  written into it verbatim (overwriting any existing value). */
export type SandboxAgent = {
  /** Stable id (slug). Set on creation, persists in localStorage. */
  id: string;
  /** Display name — fits inside the marble. Short. */
  name: string;
  /** Hex color (e.g. '#7c5cff') used for the marble fill, the
   *  agent's thinking-stream lines, and the dossier accent. */
  color: string;
  model: ModelTier;
  /** The system prompt — the role/instructions the model receives. */
  prompt: string;
  /** State variable names this agent reads as input. Empty array
   *  means the agent runs with no input context. */
  inputs: string[];
  /** State variable name this agent writes its full text output to.
   *  Empty string means the run still happens (and streams) but the
   *  output is discarded — useful for "side-effect" / debug agents. */
  output: string;
};

/** A user-declared state variable. Variables are typed loosely: the
 *  current value is just a string (opaque blob from a prior agent run,
 *  or whatever the user typed in the State shelf as initial value). */
export type SandboxStateVar = {
  /** Name (identifier-like). Used as the key in the runtime state map
   *  and referenced by agents via inputs/output. */
  name: string;
  /** Current value. Updated either by the user (via State shelf edit)
   *  or by an agent's output write. Always a string in v1 — we treat
   *  the agent return as opaque text. */
  value: string;
};

/** Persisted shape of a sandbox config. One per Bench session, kept
 *  in localStorage under SANDBOX_STORAGE_KEY so refreshes don't blow
 *  away iteration work. */
export type SandboxConfig = {
  /** Inventory: every agent the user has created, by id. */
  agents: Record<string, SandboxAgent>;
  /** Pipeline: ordered list of agent ids that will run on RUN.
   *  Agents in inventory but not in pipeline don't run. */
  pipeline: string[];
  /** Declared state variables. Initial values live here; the runner
   *  copies them into a working map at run start, then writes agent
   *  outputs back when each agent finishes. */
  state: SandboxStateVar[];
};

/** A thought log entry — one chunk of text emitted by an agent
 *  during a run. The ThinkShelf renders these in chronological
 *  order, color-coded by agent. */
export type ThoughtEntry = {
  agentId: string;
  /** Chunk of text. For streaming-friendly agents this can be a
   *  single delta; for non-streaming it's the full output. */
  text: string;
  /** When this chunk was received (ms since epoch). */
  ts: number;
};

/** Runtime status of a sandbox run. */
export type RunStatus =
  | { kind: 'idle' }
  | { kind: 'running'; currentAgentId: string }
  | { kind: 'done'; finishedAt: number }
  | { kind: 'failed'; agentId: string; error: string };

/** localStorage key for the sandbox config blob. Versioned so a future
 *  schema change can ignore old data rather than crash. */
export const SANDBOX_STORAGE_KEY = 'tarobot:bench:sandbox:v1';

/** A small palette of pleasant marble colors. Random pick when an
 *  agent is created; user can override in the dossier. */
export const SANDBOX_PALETTE: string[] = [
  '#7c5cff',  // violet
  '#3f9c5e',  // pine
  '#c4631f',  // burnt amber
  '#1e7fb3',  // steel blue
  '#a3324c',  // wine
  '#d4a64a',  // ochre
  '#5e8b73',  // sage
  '#9e3eb0',  // plum
  '#2a6f97',  // marine
  '#c4502b',  // rust
];

export function pickRandomColor(): string {
  return SANDBOX_PALETTE[Math.floor(Math.random() * SANDBOX_PALETTE.length)]!;
}

export function generateAgentId(): string {
  return `a_${Math.random().toString(36).slice(2, 9)}`;
}
