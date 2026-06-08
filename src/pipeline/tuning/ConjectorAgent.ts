// ConjectorAgent — activity #1. The cold/warm/hot dilemma hunter.
//
// In the prompt it is the "Diviner" (the mystic framing sharpens the guesses);
// in the system it is the Conjector — it conjectures. It drives the rails:
// each turn it shows a GUESS (the player taps cold/warm/hot) or a REFRAME (the
// player taps yes/no), with THINKING in between while a model call is in
// flight.
//
// Termination is budget-paced, not anchor-gated — the Diviner narrows in its
// own implicit space and commits when ready, forced to commit by the last
// move. A thread closes on YES (confirmed) or on a spent budget (soft). Then
// the RE-ROOT step finds a different charge or declares the field exhausted:
// that is the soft-out for branching; MAX_BRANCHES / GLOBAL_MOVE_BUDGET are
// the hard-outs.

import type { Agent, AgentContext } from './Agent';
import type { LLMAdapter } from '../llm/adapter';
import type { RailStep, RailInput } from '../rails/types';
import type { ConjectorResult, ConjectureRecord, Dilemma, Portrait } from './types';
import { conjectorMove, conjectorReroot, conjectorSummary } from './conjector/conjector';

/** Moves per thread (a move is a guess OR the committing reframe; the Diviner
 *  must commit by the last). Branch + global caps bound the whole Sounding. */
const MOVES_PER_BRANCH = 5;
const MAX_BRANCHES = 3;
const GLOBAL_MOVE_BUDGET = 15;

type Branch = {
  id: string;
  territory: string;
  opening: string;
  trail: ConjectureRecord[];
  leads: string[];
  pending: { kind: 'guess' | 'commit'; text: string } | null;
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
    return this.phase.kind === 'done' ? { dilemmas: this.dilemmas } : null;
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
    });
    this.movesSpent += 1;
    b.leads.push(...move.leads);
    b.pending = { kind: move.move, text: move.text };
    this.phase =
      move.move === 'guess'
        ? { kind: 'guess', text: move.text }
        : { kind: 'reframe', text: move.text };
  }

  private async afterNo(): Promise<void> {
    const b = this.branch;
    if (!b) return;
    // Out of budget → soft close; else let the Diviner re-probe or re-commit.
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
      this.phase = { kind: 'done' };
      return;
    }
    const rr = await conjectorReroot(this.adapter, {
      portrait: this.portrait,
      found: this.dilemmas.map((d) => ({
        territory: d.territory,
        reframe: d.reframe,
        claimed_leads: d.claimed_leads,
      })),
    });
    if (!rr.fresh || !rr.territory) {
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

  private record(r: NonNullable<ConjectureRecord['response']>): void {
    const b = this.branch;
    if (!b?.pending) return;
    b.trail.push({ kind: b.pending.kind, text: b.pending.text, response: r });
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
