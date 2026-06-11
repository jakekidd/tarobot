// ConjectorAgent — activity #1. The cold/warm/hot dilemma hunter.
//
// The Conjector conjectures. It drives the rails: each turn it shows a GUESS
// (the player taps cold/warm/hot) or a REFRAME (the player taps yes/no), with
// THINKING in between while a model call is in flight.
//
// Termination is budget-paced, not anchor-gated — it narrows in its own
// implicit space and commits when ready, forced to commit by the last move. A
// thread closes on YES (confirmed) or on a spent budget (soft), emitting a
// one-line HYPOTHESIS that's pushed onto the negative-space stack. The RE-ROOT
// step reads that stack to open a DIFFERENT charge (or declare the field
// exhausted) — so threads don't collide. MAX_BRANCHES / GLOBAL_MOVE_BUDGET are
// the hard-outs.

import type { Agent, AgentContext } from './Agent';
import type { LLMAdapter } from '../llm/adapter';
import type { RailStep, RailInput } from '../rails/types';
import type { ConjectorEnd, ConjectorResult, ConjectureRecord, Dilemma, Portrait } from './types';
import { conjectorMove, conjectorReroot, conjectorSummary } from './conjector/conjector';

/** Moves per thread (a move is a guess OR the committing reframe; the Conjector
 *  must commit by the last). Branch + global caps bound the whole hunt. */
const MOVES_PER_BRANCH = 5;
const MAX_BRANCHES = 3;
const GLOBAL_MOVE_BUDGET = 15;

type Branch = {
  id: string;
  territory: string;
  opening: string;
  trail: ConjectureRecord[];
  leads: string[];
  pending: { kind: 'guess' | 'commit'; text: string; dimension: string } | null;
};

type Phase =
  | { kind: 'thinking' }
  | { kind: 'guess'; text: string }
  | { kind: 'reframe'; text: string }
  | { kind: 'done' };

export class ConjectorAgent implements Agent<ConjectorResult> {
  readonly name = 'conjector';
  private adapter!: LLMAdapter;
  private portrait!: Portrait;
  private readonly listeners = new Set<() => void>();
  private phase: Phase = { kind: 'thinking' };
  private branch: Branch | null = null;
  private readonly dilemmas: Dilemma[] = [];
  private movesSpent = 0;
  private busy = false;
  /** Why the hunt stopped — set at each terminal; 'error' covers the
   *  thrown-call path (run()'s catch ends the session on whatever banked). */
  private ended: ConjectorEnd = 'error';

  init(ctx: AgentContext): void {
    this.adapter = ctx.adapter;
    this.portrait = ctx.portrait;
    // First thread opens on the portrait's hottest lead — no re-root needed.
    void this.run(() => this.open('', ''));
  }

  current(): RailStep {
    switch (this.phase.kind) {
      case 'thinking':
        return { kind: 'thinking' };
      case 'guess':
        return { kind: 'guess', text: this.phase.text };
      case 'reframe':
        return { kind: 'reframe', text: this.phase.text };
      case 'done':
        return { kind: 'done' };
    }
  }

  submit(input: RailInput): void {
    if (this.busy) return; // ignore taps while a call is in flight
    if (input.kind === 'temp' && this.phase.kind === 'guess') {
      this.record(input.value);
      void this.run(() => this.makeMove());
    } else if (input.kind === 'verdict' && this.phase.kind === 'reframe') {
      this.record(input.value);
      void this.run(() => (input.value === 'yes' ? this.close(true) : this.afterNo()));
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  result(): ConjectorResult | null {
    return this.phase.kind === 'done'
      ? { dilemmas: this.dilemmas, ended: this.ended, moves_spent: this.movesSpent }
      : null;
  }

  // ── thread lifecycle (each step runs INSIDE one run() per submit) ──

  private async open(territory: string, opening: string): Promise<void> {
    this.branch = {
      id: `d${this.dilemmas.length + 1}`,
      territory,
      opening,
      trail: [],
      leads: [],
      pending: null,
    };
    await this.makeMove();
  }

  private async makeMove(): Promise<void> {
    const b = this.branch;
    if (!b) return;
    // Budget spent with no confirmed reframe → soft close.
    if (b.trail.length >= MOVES_PER_BRANCH) {
      await this.close(false);
      return;
    }
    const move = await conjectorMove(this.adapter, {
      portrait: this.portrait,
      territory: b.territory,
      opening: b.opening,
      trail: b.trail,
      moveNumber: b.trail.length + 1,
      moveBudget: MOVES_PER_BRANCH,
      claimed: this.dilemmas.flatMap((d) => d.claimed_leads),
      explored: this.explored(),
    });
    this.movesSpent += 1;
    b.leads.push(...move.leads);
    b.pending = { kind: move.move, text: move.text, dimension: move.dimension };
    this.phase =
      move.move === 'guess'
        ? { kind: 'guess', text: move.text }
        : { kind: 'reframe', text: move.text };
  }

  private async afterNo(): Promise<void> {
    const b = this.branch;
    if (!b) return;
    // Out of budget → soft close; else let the Conjector re-probe or re-commit.
    if (b.trail.length >= MOVES_PER_BRANCH) {
      await this.close(false);
      return;
    }
    await this.makeMove();
  }

  private async close(confirmed: boolean): Promise<void> {
    const b = this.branch;
    if (!b) return;
    const reframe = lastCommit(b) ?? '';
    const summary = await conjectorSummary(this.adapter, { trail: b.trail, confirmed, reframe });
    const dilemma: Dilemma = {
      id: b.id,
      territory: b.territory || b.id,
      reframe,
      confirmed,
      hypothesis: summary.hypothesis,
      summary_md: summary.summary_md,
      claimed_leads: summary.claimed_leads.length ? summary.claimed_leads : b.leads,
      trail: b.trail,
    };
    this.dilemmas.push(dilemma);
    this.deepen(dilemma);
    this.branch = null;
    await this.advance();
  }

  private async advance(): Promise<void> {
    if (this.dilemmas.length >= MAX_BRANCHES || this.movesSpent >= GLOBAL_MOVE_BUDGET) {
      this.ended = this.dilemmas.length >= MAX_BRANCHES ? 'cap' : 'budget';
      this.phase = { kind: 'done' };
      return;
    }
    const rr = await conjectorReroot(this.adapter, {
      portrait: this.portrait,
      found: this.dilemmas.map((d) => ({
        hypothesis: d.hypothesis,
        territory: d.territory,
        claimed_leads: d.claimed_leads,
      })),
    });
    if (!rr.fresh || !rr.territory) {
      this.ended = 'exhausted';
      this.phase = { kind: 'done' };
      return;
    }
    await this.open(rr.territory, rr.opening ?? '');
  }

  /** Per-dilemma deep research fires the instant a thread closes and drains in
   *  the background while later threads run (the Compiler pool). Experts are
   *  stubbed — this commits the call site / pipelining seam. */
  private deepen(_d: Dilemma): void {
    // TODO(compiler-arc): fan out expert + augur jobs keyed by _d.id, join at Compile.
  }

  /** The negative-space stack — hypotheses of threads already found. Fed to
   *  every later move + the re-root so the search stays out of taken ground. */
  private explored(): string[] {
    return this.dilemmas.map((d) => d.hypothesis).filter(Boolean);
  }

  private record(r: NonNullable<ConjectureRecord['response']>): void {
    const b = this.branch;
    if (!b?.pending) return;
    b.trail.push({
      kind: b.pending.kind,
      text: b.pending.text,
      dimension: b.pending.dimension,
      response: r,
    });
    b.pending = null;
  }

  /** One UI transition = one run: flip to thinking, do the (possibly chained)
   *  model work, settle on a guess/reframe/done phase, emit. A thrown call
   *  ends the session with whatever was banked rather than crashing. */
  private async run(work: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.phase = { kind: 'thinking' };
    this.emit();
    try {
      await work();
    } catch {
      this.phase = { kind: 'done' };
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  private emit(): void {
    for (const l of this.listeners) {
      try { l(); } catch { /* a listener's crash is its own problem */ }
    }
  }
}

function lastCommit(b: Branch): string | null {
  for (let i = b.trail.length - 1; i >= 0; i--) {
    if (b.trail[i]!.kind === 'commit') return b.trail[i]!.text;
  }
  return null;
}
