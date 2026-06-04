// The Agent seam — the pluggable unit the TuningEngine hosts.
//
// An Agent is an interactive activity. It is primed with the Portrait (and
// any prior agents' output), then it DRIVES THE SAME UI RAILS the survey
// drove — so the screen renders an agent's turns exactly the way it renders
// the survey's, and the business logic stays backend-portable. When it
// finishes it yields an output (the DivinerAgent yields a ChargeMap).
//
// Adding a new activity — a different game, a new probe — is implementing
// this interface and registering it on the TuningEngine. That's the whole
// cost. This interface is the expansion seam the refactor exists to create.

import type { RailDriver } from '../rails/types';
import type { Portrait } from './types';

export type AgentContext = {
  portrait: Portrait;
  /** Outputs of agents that already ran this session, in order. */
  prior: unknown[];
};

/** An activity hosted by the TuningEngine. It IS a RailDriver (it drives the
 *  UI) plus a name and a priming step. `TOutput` is what it contributes to
 *  the session — e.g. the DivinerAgent contributes a ChargeMap. */
export interface Agent<TOutput = unknown> extends RailDriver<TOutput> {
  readonly name: string;
  /** Prime the agent before it starts driving the rails. */
  init(ctx: AgentContext): void;
}
