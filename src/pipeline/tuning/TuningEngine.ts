// TuningEngine — stage 2, the engine that runs AFTER the IntroductionSurvey.
//
// What it's for (the problems it solves):
//   1. Paint a Portrait (markdown vignette — NOT a picture) from the survey's
//      RawPortrait via the Condenser, its first step.
//   2. Host an ordered list of Agents and let each DRIVE THE SAME UI RAILS the
//      survey used. ConjectorAgent is activity #1 (it hunts dilemmas);
//      future activities are just more Agents.
//   3. Hand the Compiler the banked dilemmas (a ConjectorResult) for deepening.
//
// Why it's separate from the survey: the survey maps the field
// deterministically with no AI; the TuningEngine does the depth-first,
// model-driven hunting. Clean seam = the survey can lift to a backend, and a
// new activity is a new Agent rather than surgery on a monolith.
//
// Runtime: actor-facing parts are LOCAL (booth box, low latency); reasoning
// parts are CLOUD (see CLAUDE.md "Local vs cloud").
//
// The Condenser (paintPortrait) is the one piece still unwired — it lands next
// pass. The Conjector engine it feeds is built; until the Condenser exists,
// the wiring can hand `begin()` a deterministic raw→markdown Portrait.

import type { LLMAdapter } from '../llm/adapter';
import type { RawPortrait } from '../introduction-survey';
import type { Agent } from './Agent';
import { ConjectorAgent } from './ConjectorAgent';
import type { Portrait } from './types';

export class TuningEngine {
  private readonly adapter: LLMAdapter;
  private readonly raw: RawPortrait;
  /** The activities this engine runs, in order. ConjectorAgent first. */
  private readonly agents: Agent[] = [new ConjectorAgent()];

  constructor(adapter: LLMAdapter, raw: RawPortrait) {
    this.adapter = adapter;
    this.raw = raw;
  }

  /** The survey output this engine was constructed from. */
  rawPortrait(): RawPortrait {
    return this.raw;
  }

  /** Condenser: RawPortrait → markdown Portrait (one Sonnet call + a parallel
   *  cast Haiku). Not wired yet — the next pass. */
  async paintPortrait(): Promise<Portrait> {
    throw new Error('Condenser not wired yet — TuningEngine.paintPortrait is the next pass.');
  }

  /** The registered activities, in run order. */
  activities(): readonly Agent[] {
    return this.agents;
  }

  /** Prime the first activity with the painted Portrait and hand back the
   *  RailDriver the UI should drive. */
  begin(portrait: Portrait): Agent {
    const agent = this.agents[0]!;
    agent.init({ adapter: this.adapter, portrait, prior: [] });
    return agent;
  }
}
