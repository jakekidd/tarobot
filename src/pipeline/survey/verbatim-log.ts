// Verbatim log helpers. The verbatim log is an append-only immutable
// store of every free-text input the user typed during the survey. It
// is one of three artifacts that get handed downstream:
//
//   anchor          → markdown prose the profiler writes (interpreted)
//   verbatim_log    → user's exact words (raw, never paraphrased)
//   timing_log      → telemetry only (never shown to agents)
//
// The profiler references INTO this log ("said it 'preserves rest' —
// see entry 7") rather than reproducing quotes, because LLM paraphrase
// would corrupt the fidelity that uncanny callbacks depend on.
//
// Capture points (wired in engine.ts):
//   'name'             — name opener
//   'intent'           — intent opener + final submitIntention
//   'relationship_label' — relationship_pick when category != 'existing'
//   'text_fallback'    — Phase 3+ free-text option fallbacks
//   'correction'       — Phase 3+ assertion correction text

import type { VerbatimEntry } from './types';

/** Append a new VerbatimEntry to the log. Pure — returns a new array
 *  rather than mutating. Trims leading/trailing whitespace; returns the
 *  existing log unchanged when the text is empty post-trim. */
export function appendVerbatim(
  log: readonly VerbatimEntry[],
  args: {
    turn: number;
    source: VerbatimEntry['source'];
    text: string;
  },
): VerbatimEntry[] {
  const trimmed = args.text.trim();
  if (!trimmed) return [...log];
  const entry: VerbatimEntry = {
    index: log.length,
    turn: args.turn,
    source: args.source,
    text: trimmed,
    captured_at: Date.now(),
  };
  return [...log, entry];
}

/** Stringify an entry for prompt embedding. */
export function formatVerbatimEntry(entry: VerbatimEntry): string {
  return `[${entry.index}] (T${entry.turn}, ${entry.source}) ${entry.text}`;
}

/** Stringify the whole log for prompt embedding. Empty log → empty
 *  string (no header). */
export function formatVerbatimLog(log: readonly VerbatimEntry[]): string {
  if (log.length === 0) return '';
  return log.map(formatVerbatimEntry).join('\n');
}
