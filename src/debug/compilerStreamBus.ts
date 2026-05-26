// Pub/sub for the close-pass Compiler's streamed output.
//
// The compiler runs ONCE per session at survey close, Opus with extended
// thinking enabled. It streams two channels:
//   - thinking deltas (the model's reasoning trace)
//   - tool input deltas (the anchor markdown JSON accumulating)
//
// The UI subscribes to render the thinking stream in the dialogue as
// it builds. Stream drops/skips are acceptable — the user just sees
// progress.

export type CompilerStreamEvent =
  | { kind: 'start' }
  | { kind: 'thinking'; chunk: string }
  | { kind: 'tool_input'; chunk: string }
  | { kind: 'end' };

type Listener = (event: CompilerStreamEvent) => void;
const listeners = new Set<Listener>();

export function publishCompilerStream(event: CompilerStreamEvent): void {
  for (const fn of listeners) {
    try { fn(event); } catch { /* swallow */ }
  }
}

export function subscribeCompilerStream(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
