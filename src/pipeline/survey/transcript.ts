// Unified transcript — the narrative document the detective reads.
//
// Entries are written incrementally as the survey runs:
//   - pillar/pick:  the question, its options, the user's pick + what
//                   they didn't pick (negative space) + latency-z
//   - assertion:    a detective-emitted assertion (the question voiced
//                   to the user)
//   - response:     warm / cold + optional correction text
//
// The detective payload renders the transcript as one continuous
// narrative document so the model reads questions, answers, negative
// space, z-scores, prior assertions, and responses in chronological
// order — the same way a human reader would skim the session.

import type { PickEvent } from './types';

export type TranscriptEntry =
  | {
      kind: 'pick';
      /** 1-based pillar index. 0 for opener picks (rare in transcript;
       *  openers are mostly filtered out). */
      pillar_idx: number;
      question: string;
      options_shown: string[];
      picked: string | string[];
      /** Options shown that the user did NOT pick. */
      negative_space: string[];
      latency_ms: number;
      latency_z?: number;
    }
  | {
      kind: 'assertion';
      /** 1-based assertion index within the Interrogation phase. */
      assertion_idx: number;
      statement: string;
    }
  | {
      kind: 'response';
      assertion_idx: number;
      direction: 'warm' | 'cold' | 'hot';
      /** Optional follow-up text the user typed after picking. */
      correction?: string;
      latency_ms: number;
    };

/** Render the transcript as the narrative document the detective
 *  reads. Each entry maps to a few lines of plain text in chronological
 *  order. Cheap; called every detective payload build. */
export function renderTranscript(entries: readonly TranscriptEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    switch (entry.kind) {
      case 'pick': {
        lines.push(`Q${entry.pillar_idx}. ${entry.question}`);
        if (entry.options_shown.length > 0) {
          lines.push(`    options: ${entry.options_shown.join(', ')}`);
        }
        const picked = typeof entry.picked === 'string' ? entry.picked : entry.picked.join(', ');
        const zStr = entry.latency_z !== undefined
          ? `  [z=${entry.latency_z >= 0 ? '+' : ''}${entry.latency_z.toFixed(1)}${entry.latency_z > 1.5 ? ', slow' : entry.latency_z < -1.5 ? ', quick' : ''}]`
          : '';
        lines.push(`    picked: ${picked}${zStr}`);
        if (entry.negative_space.length > 0) {
          lines.push(`    skipped: ${entry.negative_space.join(', ')}`);
        }
        break;
      }
      case 'assertion': {
        lines.push(`A${entry.assertion_idx}. ${entry.statement}`);
        break;
      }
      case 'response': {
        let s = `    → ${entry.direction.toUpperCase()}`;
        if (entry.correction) s += ` ("${entry.correction}")`;
        lines.push(s);
        break;
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Build a transcript pick entry from a PickEvent. */
export function pickToTranscriptEntry(
  pick: PickEvent,
  pillar_idx: number,
  latency_z?: number,
): TranscriptEntry & { kind: 'pick' } {
  const optionsShown = pick.options_shown ?? [];
  const pickedRaw = pick.answer;
  const negative_space = optionsShown.filter((opt) => {
    if (typeof pickedRaw === 'string') return opt !== pickedRaw;
    return !pickedRaw.includes(opt);
  });
  return {
    kind: 'pick',
    pillar_idx,
    question: pick.question_text,
    options_shown: optionsShown,
    picked: pickedRaw,
    negative_space,
    latency_ms: pick.latency_ms,
    latency_z,
  };
}
