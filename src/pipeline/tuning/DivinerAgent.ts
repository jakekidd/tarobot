// DivinerAgent — activity #1.
//
// It hunts CHARGES: guesses where the user's weight lives, reads their
// warm/cold/hot response, goes depth-first per charge, banks each. It is the
// home the existing diviner pipeline (pipeline/antechamber/agents/diviner)
// migrates into during the diviner overhaul — that AI pipeline is left fully
// intact for now, deliberately not bulldozed.
//
// NOT WIRED THIS PASS. The flow ends at the survey's RawPortrait dump; this
// is the seam the next arc plugs into — typed and documented so the shape is
// committed even though the behavior isn't.

import type { Agent, AgentContext } from './Agent';
import type { RailStep, RailInput } from '../rails/types';
import type { ChargeMap, Portrait } from './types';

const NOT_WIRED = 'DivinerAgent is not wired yet — the TuningEngine is out of scope this pass.';

export class DivinerAgent implements Agent<ChargeMap> {
  readonly name = 'diviner';
  private portrait: Portrait | null = null;

  init(ctx: AgentContext): void {
    this.portrait = ctx.portrait;
  }

  current(): RailStep {
    // The overhaul wires this to emit guess steps from the existing diviner,
    // conditioned on `this.portrait`.
    void this.portrait;
    throw new Error(NOT_WIRED);
  }

  submit(input: RailInput): void {
    void input;
    throw new Error(NOT_WIRED);
  }

  subscribe(listener: () => void): () => void {
    void listener;
    return () => {};
  }

  result(): ChargeMap | null {
    return null;
  }
}
