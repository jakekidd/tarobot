// Cross-component snapshot of the antechamber engine's state. Lets the
// debug-side AgentActivity panel pull picks_log + identity + investigation
// for the COPY TRANSCRIPT export without threading the engine through
// React context. Antechamber.tsx publishes on every state change; the panel
// reads on demand.

import type { EngineState } from '../pipeline/antechamber';

let current: EngineState | null = null;

export function publishAntechamberState(s: EngineState | null): void {
  current = s;
}

export function getAntechamberState(): EngineState | null {
  return current;
}
