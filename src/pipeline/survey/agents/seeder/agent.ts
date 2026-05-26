// Seeder agent — Haiku, freeform output (indent-separated observation
// lines). Fires after each pillar answer. Output is plain text lines;
// the engine parses them and appends to the unified transcript.

import type { LLMAdapter } from '../../../llm/adapter';
import { SEEDER_SYSTEM_TEMPLATE } from './prompt';
import { renderTranscript } from '../../transcript';
import { formatVerbatimLog } from '../../verbatim-log';
import { getNode } from '../../tree';
import { probeToString } from '../../types';
import type { EngineState, PickEvent } from '../../types';

export type RunSeederArgs = {
  state: EngineState;
  pick: PickEvent;
};

export async function runSeeder(
  adapter: LLMAdapter,
  args: RunSeederArgs,
): Promise<string[]> {
  const { state, pick } = args;

  const transcript = renderTranscript(state.transcript) || '(empty — first turn)';

  const node = getNode(pick.node_id);
  const optionsShown = pick.options_shown ?? [];
  const pickedRaw = pick.answer;
  const picked = typeof pickedRaw === 'string' ? pickedRaw : pickedRaw.join(', ');
  const skipped = optionsShown.filter((opt) => {
    if (typeof pickedRaw === 'string') return opt !== pickedRaw;
    return !pickedRaw.includes(opt);
  });
  const inversions = node ? probeToString(node.probe) : undefined;

  const thisTurn = [
    `Q: ${pick.question_text}`,
    optionsShown.length > 0 ? `options: ${optionsShown.join(', ')}` : '',
    `picked: ${picked}`,
    skipped.length > 0 ? `skipped: ${skipped.join(', ')}` : '',
    inversions ? `decoder: ${inversions}` : '',
  ].filter(Boolean).join('\n');

  const verbatim = formatVerbatimLog(state.verbatim_log) || '(none)';

  const system = SEEDER_SYSTEM_TEMPLATE
    .replace('{{TRANSCRIPT}}', transcript)
    .replace('{{THIS_TURN}}', thisTurn)
    .replace('{{VERBATIM_LOG}}', verbatim);

  const raw = await adapter.invokeFreeform({
    system,
    user: 'continue.',
    model: 'fast',
    max_tokens: 600,
  });

  return parseSeederLines(raw);
}

/** Split the freeform output into observation lines. Trims, drops
 *  empty + duplicate lines. Period-truncation not applied here —
 *  observations can be short sentences. */
export function parseSeederLines(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    // Skip leading bullets/dashes/numbers the model might emit despite
    // instructions, to keep the lines clean.
    const cleaned = line.replace(/^[-*•·]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (cleaned.length === 0) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}
