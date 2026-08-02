// The piles — cognition's output, detached from the scroll. Append-only,
// anchored, tail-windowed. Refiling (refreshes: id) is the persistence
// mechanism: what stops being refiled slides out of every model's view.
// No decay timers exist. The facts pile is the one exception: a ledger,
// merged by label, consumed whole (by attention only).

import type {
  AgentName,
  Anchor,
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

  view(): PilesView {
    return {
      reads: this.reads.all(),
      intents: this.intents.all(),
    };
  }
}
