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
//
// FIDELITY RULE: the *_preview fields are for the panel; the un-suffixed
// full fields (`system`, `user`, `response_full`, `thinking`) hold the
// COMPLETE text of every call. The copied transcript is the debugging
// record — zero inference happens off-transcript, so nothing here may
// truncate what the model saw or said.

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
  /** COMPLETE system prompt the model saw. */
  system?: string;
  /** COMPLETE user message the model saw. */
  user?: string;
  /** COMPLETE response (tool JSON pretty-printed, or freeform text). */
  response_full?: string;
  /** Extended-thinking trace, when the call ran with a thinking budget. */
  thinking?: string;
  /** Bytes / chars of the response payload, when known. */
  response_size?: number;
  /** First ~500 chars of the response — useful for "what did the model say". */
  response_preview?: string;
  /** Error message when status === 'failed'. */
  error?: string;
  /** System prompt the model saw, truncated for the panel. Captures
   *  the literal text sent — would have caught the astrology /
   *  instagram fabrications faster if exposed during dev. */
  system_preview?: string;
  /** User message the model saw (typically JSON.stringify of the
   *  payload), truncated for the panel. */
  user_preview?: string;
  /** Untruncated sizes — shown in the expand caption so the user
   *  knows when they're looking at a slice vs the whole thing. */
  system_size?: number;
  user_size?: number;
};

const EVENT_CAP = 300;

type Listener = (events: readonly AgentEvent[]) => void;

const events: AgentEvent[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  const snapshot = events.slice();
  for (const fn of listeners) {
    try { fn(snapshot); } catch { /* swallow */ }
  }
}

/** Truncation cap for prompt previews. ~2KB is enough to spot
 *  fabrication-prone phrasing without overwhelming the panel. */
const PROMPT_PREVIEW_CAP = 2000;

function preview(s: string | undefined): { preview?: string; size?: number } {
  if (s === undefined) return {};
  if (s.length > PROMPT_PREVIEW_CAP) {
    return { preview: `${s.slice(0, PROMPT_PREVIEW_CAP)}…`, size: s.length };
  }
  return { preview: s, size: s.length };
}

export function startAgentEvent(args: {
  id: string;
  label: string;
  model?: string;
  /** Literal system prompt sent to the model. Stored in full. */
  system?: string;
  /** Literal user message sent to the model. Stored in full. */
  user?: string;
}): void {
  const sys = preview(args.system);
  const usr = preview(args.user);
  events.push({
    id: args.id,
    label: args.label,
    model: args.model,
    status: 'started',
    started_at: Date.now(),
    system: args.system,
    user: args.user,
    system_preview: sys.preview,
    system_size: sys.size,
    user_preview: usr.preview,
    user_size: usr.size,
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
      s = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    } catch {
      s = '[unserializable]';
    }
    ev.response_full = s;
    ev.response_size = s.length;
    ev.response_preview = s.length > 600 ? `${s.slice(0, 600)}…` : s;
  }
  emit();
}

/** Accumulate an extended-thinking delta onto an in-flight event. No emit —
 *  the panel doesn't render thinking live; the transcript reads it at copy
 *  time. */
export function appendAgentThinking(args: { id: string; delta: string }): void {
  const ev = events.find((e) => e.id === args.id);
  if (!ev) return;
  ev.thinking = (ev.thinking ?? '') + args.delta;
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
