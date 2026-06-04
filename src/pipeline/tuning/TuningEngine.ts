// TuningEngine — stage 2, the engine that runs AFTER the IntroductionSurvey.
//
// What it's for (the problems it solves):
//   1. Paint a Portrait (a light vignette profile, NOT a picture) from the
//      survey's RawPortrait — one model call, its first step.
//   2. Host an ordered list of Agents and let each DRIVE THE SAME UI RAILS
//      the survey used. DivinerAgent is activity #1 (it hunts charges);
//      future activities are just more Agents.
//   3. Hand the Compiler a ChargeMap — banked, unranked charges — and let
//      the player collaboratively pick the reading's spine.
//
// Why it's separate from the survey: the survey maps the field
// deterministically with no AI; the TuningEngine does the depth-first,
// model-driven hunting. Clean seam = the survey can lift to a backend, and a
// new activity is a new Agent rather than surgery on a monolith.
//
// Runtime: actor-facing parts are LOCAL (booth box, low latency); reasoning
// parts are CLOUD (see CLAUDE.md "Local vs cloud").
//
// NOT FUNCTIONAL THIS PASS — intentionally a shell. The survey dumps its
// RawPortrait and the flow ends here. Wiring this (and the diviner overhaul
// that fills DivinerAgent) is the next arc.

import type { RawPortrait } from '../introduction-survey';
import type { Agent } from './Agent';
import { DivinerAgent } from './DivinerAgent';
import type { ChargeMap, Portrait } from './types';

export class TuningEngine {
  private readonly raw: RawPortrait;
  /** The activities this engine runs, in order. DivinerAgent first. */
  private readonly agents: Agent[] = [new DivinerAgent()];

  constructor(raw: RawPortrait) {
    this.raw = raw;
  }

  /** The survey output this engine was constructed from. */
  rawPortrait(): RawPortrait {
    return this.raw;
  }

  /** First step: paint the Portrait from the RawPortrait (one model call).
   *  Stubbed — the painter lands next pass. */
  async paintPortrait(): Promise<Portrait> {
    throw new Error('TuningEngine.paintPortrait is not wired yet — out of scope this pass.');
  }

  /** The registered activities, in run order. */
  activities(): readonly Agent[] {
    return this.agents;
  }

  /** The collaborative Tuning → Compiler artifact. Null until the agents run. */
  chargeMap(): ChargeMap | null {
    return null;
  }
}
