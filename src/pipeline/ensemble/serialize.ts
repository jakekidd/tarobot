// Session serialization — ONE artifact shape for both consumers: the
// xray lab's export button and the headless e2e runner write the same
// SessionRecord, so a browser session and a terminal session are
// interchangeable evidence. Pure functions, no DOM, no fs.

import type { CallRecord, EnsembleInput, EnsembleSnapshot } from './types';

export type SessionRecord = {
  exportedAt: string;
  input: EnsembleInput;
  snapshot: EnsembleSnapshot;
  calls: CallRecord[];
};

export function serializeSession(
  input: EnsembleInput,
  snapshot: EnsembleSnapshot,
  calls: CallRecord[],
): SessionRecord {
  return { exportedAt: new Date().toISOString(), input, snapshot, calls };
}

/** the human render: full-fidelity markdown — the scroll, then every
 *  model call with its complete system/user/output. nothing truncated;
 *  truncation is for UI previews only. */
export function buildSessionLog(record: SessionRecord): string {
  const out: string[] = [];
  const { input, snapshot, calls } = record;

  out.push(`# ensemble session — ${input.mode}`);
  out.push(`exported ${record.exportedAt}`);
  out.push('');
  out.push(`scenario: ${input.scenario}`);
  out.push(`docs: ${input.docs.map((d) => d.name).join(' · ') || '(none)'}`);
  out.push('');

  out.push('## the scroll');
  out.push('');
  for (const e of snapshot.scroll) {
    if (e.kind === 'beat') {
      out.push(`**${e.speaker}:** ${e.text}${e.truncated ? ' *(cut off)*' : ''}`);
    } else {
      out.push(`*⟨${e.ev}${e.slot !== undefined ? ` ${e.slot}` : ''}⟩*`);
    }
    out.push('');
  }

  out.push('## piles at close');
  out.push('');
  const p = snapshot.piles;
  out.push(`- reads ${p.reads.length} · thoughts ${p.thoughts.length} · questions ${p.questions.length} · facts ${p.facts.length} · bits ${p.bits.length} · predictions ${p.predictions.length} · intents ${p.intents.length}`);
  out.push(`- cassandra: ${snapshot.cassandra.hit} hit / ${snapshot.cassandra.graze} graze / ${snapshot.cassandra.miss} miss`);
  out.push(`- frame versions: ${snapshot.frames.map((f) => `v${f.v}(${f.trigger})`).join(' → ')}`);
  out.push('');

  out.push('## every call, full fidelity');
  out.push('');
  for (const c of calls) {
    const ms = c.endedAt !== undefined ? `${c.endedAt - c.startedAt}ms` : 'unfinished';
    out.push(`### ${c.agent} · ${c.tier} · ${ms}${c.error ? ' · ERROR' : ''}`);
    out.push('');
    out.push('<details><summary>system</summary>');
    out.push('');
    out.push('```');
    out.push(c.system);
    out.push('```');
    out.push('</details>');
    out.push('');
    out.push('<details><summary>user</summary>');
    out.push('');
    out.push('```');
    out.push(c.user);
    out.push('```');
    out.push('</details>');
    out.push('');
    if (c.error) {
      out.push(`error: \`${c.error}\``);
    } else {
      out.push('output:');
      out.push('```json');
      out.push(typeof c.output === 'string' ? c.output : JSON.stringify(c.output, null, 2));
      out.push('```');
    }
    out.push('');
  }

  out.push('## resourcing');
  out.push('');
  out.push('| agent | calls | total ms | errors |');
  out.push('|---|---|---|---|');
  const byAgent = new Map<string, { calls: number; ms: number; errors: number }>();
  for (const c of calls) {
    const row = byAgent.get(c.agent) ?? { calls: 0, ms: 0, errors: 0 };
    row.calls += 1;
    if (c.endedAt !== undefined) row.ms += c.endedAt - c.startedAt;
    if (c.error) row.errors += 1;
    byAgent.set(c.agent, row);
  }
  for (const [agent, row] of byAgent) {
    out.push(`| ${agent} | ${row.calls} | ${row.ms} | ${row.errors} |`);
  }
  out.push('');

  return out.join('\n');
}
