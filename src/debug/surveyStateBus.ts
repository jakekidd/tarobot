// Cross-component snapshot of the survey engine's state. Lets the
// debug-side AgentActivity panel pull picks_log + identity + investigation
// for the COPY TRANSCRIPT export without threading the engine through
// React context. Survey.tsx publishes on every state change; the panel
// reads on demand.

import type { EngineState } from '../pipeline/survey';

let current: EngineState | null = null;

export function publishSurveyState(s: EngineState | null): void {
  current = s;
}

export function getSurveyState(): EngineState | null {
  return current;
}
