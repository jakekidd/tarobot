// Conjector call wrappers. Each builds an InvocationSpec and routes through
// adapter.invoke(). No SDK calls here. Three ops drive the whole hunt:
//   - move    : the live cold/warm/hot loop — one guess, or the reframe.
//   - reroot  : between threads — find a different charge, or stop.
//   - summary : on close — the deepen doc + the one-line hypothesis that joins
//               the negative-space stack.

import type { LLMAdapter } from '../../llm/adapter';
import type { ConjectureRecord, Portrait } from '../types';
import {
  MOVE_SYSTEM, MOVE_TOOL,
  REROOT_SYSTEM, REROOT_TOOL,
  SUMMARY_SYSTEM, SUMMARY_TOOL,
} from './prompts';
import { MoveSchema, RerootSchema, SummarySchema, type Move, type Reroot, type Summary } from './schemas';

/** The RawPortrait appendix the Conjector consults to verify a specific. */
function appendix(p: Portrait): string {
  return JSON.stringify({ identity: p.raw.identity, amalgam: p.raw.amalgam }, null, 2);
}

function moves(trail: ConjectureRecord[]) {
  return trail.map((r) => ({
    kind: r.kind,
    text: r.text,
    dimension: r.dimension ?? '',
    response: r.response,
  }));
}

export type MoveInput = {
  portrait: Portrait;
  territory: string;
  opening: string;
  trail: ConjectureRecord[];
  moveNumber: number;
  moveBudget: number;
  claimed: string[];
  /** The negative-space stack — hypotheses of threads already found, so this
   *  thread opens different territory. */
  explored: string[];
};

export async function conjectorMove(adapter: LLMAdapter, input: MoveInput): Promise<Move> {
  const last = input.moveNumber >= input.moveBudget;
  const payload = {
    portrait: input.portrait.markdown,
    appendix: appendix(input.portrait),
    thread_territory: input.territory || '(open — pick the hottest UNEXPLORED lead in the portrait)',
    opening_angle: input.opening || null,
    moves_so_far: moves(input.trail),
    you_are_on_move: input.moveNumber,
    move_budget: input.moveBudget,
    already_found_search_elsewhere: input.explored,
    leads_already_claimed_do_not_reprobe: input.claimed,
    instruction: last
      ? 'this is your LAST move for this thread — you MUST set move to "commit" and give the reframe now.'
      : 'make one move: a guess, or commit the reframe if you are already sure. stay out of the already-found territory.',
  };
  return adapter.invoke<Move>(
    {
      system: MOVE_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: MOVE_TOOL,
      model: 'cognition',
      max_tokens: 500,
    },
    MoveSchema,
  );
}

export type RerootInput = {
  portrait: Portrait;
  /** The negative-space stack — what's already been found, as hypothesis
   *  fragments + the leads each consumed. */
  found: { hypothesis: string; territory: string; claimed_leads: string[] }[];
};

export async function conjectorReroot(adapter: LLMAdapter, input: RerootInput): Promise<Reroot> {
  const payload = {
    portrait: input.portrait.markdown,
    appendix: appendix(input.portrait),
    already_found: input.found,
    instruction:
      'is there a genuinely DIFFERENT live charge here, OUTSIDE every hypothesis already found? if yes set fresh=true and name the territory + opening angle. if no set fresh=false and say why. do not force a second thread.',
  };
  return adapter.invoke<Reroot>(
    {
      system: REROOT_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: REROOT_TOOL,
      model: 'cognition',
      max_tokens: 400,
    },
    RerootSchema,
  );
}

export type SummaryInput = {
  trail: ConjectureRecord[];
  confirmed: boolean;
  reframe: string;
};

export async function conjectorSummary(adapter: LLMAdapter, input: SummaryInput): Promise<Summary> {
  const payload = {
    moves: moves(input.trail),
    reframe: input.reframe || null,
    player_confirmed_the_reframe: input.confirmed,
    instruction:
      'write your first-person close of this thread for the experts who will deepen it. honest confidence — what landed, what is uncertain, what missed. end with one line of posture for the seer. emit the one-line hypothesis (what this thread was about, for the negative-space stack). mark which portrait leads this thread claimed.',
  };
  return adapter.invoke<Summary>(
    {
      system: SUMMARY_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: SUMMARY_TOOL,
      model: 'cognition',
      max_tokens: 700,
    },
    SummarySchema,
  );
}
