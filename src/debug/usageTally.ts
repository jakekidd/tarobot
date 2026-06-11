// Session-cumulative LLM token tally — the consumer for the adapter's
// onUsage callback. Debug-surface only: publishes a compact per-model
// summary line to the debug bus (the overlay renders it as a kv row).
// Festival budgeting needs real numbers, not vibes.

import { publishDebug } from './debugBus';

type Tally = { calls: number; input: number; output: number };

const byModel = new Map<string, Tally>();

export function recordUsage(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): void {
  const t = byModel.get(model) ?? { calls: 0, input: 0, output: 0 };
  t.calls += 1;
  t.input += usage.input_tokens;
  t.output += usage.output_tokens;
  byModel.set(model, t);
  publishDebug('llm.tokens', summary());
}

function summary(): string {
  const parts: string[] = [];
  for (const [model, t] of byModel) {
    const short = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    parts.push(`${short} ×${t.calls} ${k(t.input)}→${k(t.output)}`);
  }
  return parts.join(' · ');
}

function k(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
