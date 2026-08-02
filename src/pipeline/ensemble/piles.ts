// The piles — cognition's output, detached from the scroll. Append-only,
// anchored, tail-windowed. Refiling (refreshes: id) is the persistence
// mechanism: what stops being refiled slides out of every model's view.
// No decay timers exist. The facts pile is the one exception: a ledger,
// merged by label, consumed whole (by attention only).

import type {
  AgentName,
  Anchor,
  Fact,
  Intent,
  PileItem,
  PilesView,
  Read,
} from './types';

let nextItemId = 1;
function itemId(): string {
  return `pi-${nextItemId++}`;
}

class Pile<P> {
  private items: PileItem<P>[] = [];

  append(agent: AgentName, anchor: Anchor, payload: P, refreshes?: string): PileItem<P> {
    const item: PileItem<P> = {
      id: itemId(),
      agent,
      anchor,
      t: Date.now(),
      payload,
      refreshes,
    };
    this.items.push(item);
    return item;
  }

  /** the tail the consumers see — refiled items count once, at their
   *  newest position (the renewal supersedes what it refreshes). */
  tail(n: number): PileItem<P>[] {
    const superseded = new Set(
      this.items.map((i) => i.refreshes).filter((r): r is string => !!r),
    );
    const live = this.items.filter((i) => !superseded.has(i.id));
    return live.slice(-n);
  }

  all(): PileItem<P>[] {
    return this.items.slice();
  }

  last(): PileItem<P> | undefined {
    return this.items[this.items.length - 1];
  }

  patch(id: string, fn: (payload: P) => P): void {
    const item = this.items.find((i) => i.id === id);
    if (item) item.payload = fn(item.payload);
  }
}

export class Piles {
  readonly reads = new Pile<Read>();
  readonly intents = new Pile<Intent>();

  // The ledger — merged by label, newest from-the-mouth wins.
  private factItems: PileItem<Fact>[] = [];

  mergeFacts(agent: AgentName, anchor: Anchor, facts: Fact[], cap: number): void {
    for (const fact of facts) {
      const existing = this.factItems.find(
        (i) => i.payload.label.toLowerCase() === fact.label.toLowerCase(),
      );
      if (existing) {
        existing.payload = fact;
        existing.t = Date.now();
        existing.anchor = anchor;
      } else {
        this.factItems.push({ id: itemId(), agent, anchor, t: Date.now(), payload: fact });
      }
    }
    // Over cap: drop the stalest (oldest touch) first.
    while (this.factItems.length > cap) {
      let stalest = 0;
      for (let i = 1; i < this.factItems.length; i++) {
        if (this.factItems[i].t < this.factItems[stalest].t) stalest = i;
      }
      this.factItems.splice(stalest, 1);
    }
  }

  ledger(): PileItem<Fact>[] {
    return this.factItems.slice();
  }

  view(): PilesView {
    return {
      reads: this.reads.all(),
      facts: this.ledger(),
      intents: this.intents.all(),
    };
  }
}
