// Token accountant for the bot harness. Records every model call's
// input/output tokens, accumulates them per session, persists to a JSON file
// across sessions so we can see lifetime spend at a glance.

import * as fs from 'node:fs';
import * as path from 'node:path';

export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
};

type ModelTotals = {
  input: number;
  output: number;
  calls: number;
};

type PersistedShape = {
  lifetime: Record<string, ModelTotals>;
  sessions: Array<{
    started_at: string;
    duration_ms: number;
    archetype: string;
    close_reason: string | null;
    by_model: Record<string, ModelTotals>;
  }>;
};

const sessionTotals: Record<string, ModelTotals> = {};
const sessionStart = Date.now();

export function recordTokens(model: string, usage: AnthropicUsage): void {
  const cur = sessionTotals[model] ?? { input: 0, output: 0, calls: 0 };
  cur.input += usage.input_tokens ?? 0;
  cur.output += usage.output_tokens ?? 0;
  cur.calls += 1;
  sessionTotals[model] = cur;
}

export function getSessionTotals(): Record<string, ModelTotals> {
  return sessionTotals;
}

export function formatSessionSummary(): string {
  const lines: string[] = [];
  let totalIn = 0;
  let totalOut = 0;
  for (const [model, t] of Object.entries(sessionTotals)) {
    lines.push(`  ${model}: ${t.calls} calls, ${t.input} in / ${t.output} out`);
    totalIn += t.input;
    totalOut += t.output;
  }
  lines.push(`  ──────`);
  lines.push(`  total: ${totalIn} in / ${totalOut} out`);
  return lines.join('\n');
}

export function persistSession(file: string, archetype: string, closeReason: string | null): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data: PersistedShape = { lifetime: {}, sessions: [] };
  if (fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedShape;
      if (!data.lifetime) data.lifetime = {};
      if (!Array.isArray(data.sessions)) data.sessions = [];
    } catch {
      data = { lifetime: {}, sessions: [] };
    }
  }

  data.sessions.push({
    started_at: new Date(sessionStart).toISOString(),
    duration_ms: Date.now() - sessionStart,
    archetype,
    close_reason: closeReason,
    by_model: structuredClone(sessionTotals),
  });

  for (const model of Object.keys(sessionTotals)) {
    const lt = data.lifetime[model] ?? { input: 0, output: 0, calls: 0 };
    const s = sessionTotals[model]!;
    lt.input += s.input;
    lt.output += s.output;
    lt.calls += s.calls;
    data.lifetime[model] = lt;
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
