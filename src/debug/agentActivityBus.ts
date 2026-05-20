// Live agent activity stream. Every adapter.invoke() and
// invokeFreeform() publishes start / complete / fail events here so we
// have a real-time view of what cognition is doing — useful while the
// seer is preparing (otherwise the screen just says "preparing" with
// no insight into which stage is taking time).
//
// Concretely: every event carries the agent's tool name (or 'freeform'),
// the model tier, the call ID for matching start/complete, the duration
// once complete, and an optional response preview (truncated). The UI
// renders a scrolling log; events older than EVENT_CAP fall off.

export type AgentEvent = {
  id: string;
  /** Tool name (e.g. 'observer_metabolize') or 'freeform' for invokeFreeform. */
  label: string;
  /** 'fast' | 'cognition' | 'deep' — model tier the adapter picked. */
  model?: string;
  status: 'started' | 'completed' | 'failed';
  /** ms since session start (or wall clock — caller's choice). */
  started_at: number;
  /** Filled when status flips to completed/failed. */
  ended_at?: number;
  /** Bytes / chars of the response payload, when known. */
  response_size?: number;
  /** First ~500 chars of the response — useful for "what did the model say". */
  response_preview?: string;
  /** Error message when status === 'failed'. */
  error?: string;
};

const EVENT_CAP = 80;

type Listener = (events: readonly AgentEvent[]) => void;

const events: AgentEvent[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  const snapshot = events.slice();
  for (const fn of listeners) {
    try { fn(snapshot); } catch { /* swallow */ }
  }
}

export function startAgentEvent(args: {
  id: string;
  label: string;
  model?: string;
}): void {
  events.push({
    id: args.id,
    label: args.label,
    model: args.model,
    status: 'started',
    started_at: Date.now(),
  });
  while (events.length > EVENT_CAP) events.shift();
  emit();
}

export function completeAgentEvent(args: {
  id: string;
  response?: unknown;
}): void {
  const ev = events.find((e) => e.id === args.id);
  if (!ev) return;
  ev.status = 'completed';
  ev.ended_at = Date.now();
  const raw = args.response;
  if (raw !== undefined) {
    let s: string;
    try {
      s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch {
      s = '[unserializable]';
    }
    ev.response_size = s.length;
    ev.response_preview = s.length > 600 ? `${s.slice(0, 600)}…` : s;
  }
  emit();
}

export function failAgentEvent(args: { id: string; error: string }): void {
  const ev = events.find((e) => e.id === args.id);
  if (!ev) return;
  ev.status = 'failed';
  ev.ended_at = Date.now();
  ev.error = args.error;
  emit();
}

export function subscribeAgentActivity(fn: Listener): () => void {
  listeners.add(fn);
  // Fire immediately so the consumer renders any pre-mount history.
  try { fn(events.slice()); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}

export function getAgentEvents(): readonly AgentEvent[] {
  return events;
}

export function clearAgentEvents(): void {
  events.length = 0;
  emit();
}
