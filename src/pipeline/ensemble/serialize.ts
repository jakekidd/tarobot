// Session serialization — ONE artifact shape for both consumers: the
// xray lab's export button and the headless e2e runner write the same
// SessionRecord, so a browser session and a terminal session are
// interchangeable evidence. Pure functions, no DOM, no fs.

import type { Beat, CallRecord, EnsembleInput, EnsembleSnapshot } from './types';

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
  out.push(`- reads ${p.reads.length} · intents ${p.intents.length} · profile ${snapshot.profile.length}/14 · class ${snapshot.dilemmaClass ?? '—'} · spread ${snapshot.spreadClass ?? '—'} · naming ${snapshot.namingDelivered ? 'delivered' : 'no'}${snapshot.dilemma.quest_md ? ' · quest drafted' : ''}`);
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

/** the xray transcript — speech unindented, everything offstage (engine
 *  decisions, agent thinking) indented with a tab, all in time order.
 *  the brainstorm/share format: what was said, above what was thought. */
export function buildXrayTranscript(record: SessionRecord): string {
  type Line = { t: number; text: string };
  const lines: Line[] = [];
  const T = '\t';

  for (const e of record.snapshot.scroll) {
    if (e.kind === 'beat') {
      const b = e as Beat;
      const tag = b.speaker === 'oracle' && b.beatType ? ` [${b.beatType}]` : '';
      lines.push({ t: e.t, text: `${b.speaker}${tag}: ${b.text}` });
      if (b.fills && b.fills.length > 0) {
        lines.push({
          t: e.t,
          text: `${T}fills: ${b.fills.map((f) => `${f.key}="${f.text}"`).join(' · ')}`,
        });
      }
    } else {
      lines.push({ t: e.t, text: `${T}⟨${e.ev}${e.slot !== undefined ? ` ${e.slot}` : ''}⟩` });
    }
  }

  for (const entry of record.snapshot.log ?? []) {
    lines.push({ t: entry.t, text: `${T}• ${entry.text}` });
  }

  const q = (v: unknown) => `"${String(v)}"`;
  for (const c of record.calls) {
    const ms = c.endedAt !== undefined ? `${((c.endedAt - c.startedAt) / 1000).toFixed(1)}s` : '…';
    const o = (c.output ?? {}) as Record<string, unknown>;
    let body = '';
    if (c.error) body = `ERROR ${c.error}`;
    else
      switch (c.agent) {
        case 'driver':
          body = `→ ${String(o.beat ?? o.move ?? '?')}${o.frame ? `/${String(o.frame)}` : ''}${o.target ? ` @ ${String(o.target)}` : ''} · do ${q(o.accomplish)}${o.ammo ? ` · ammo ${q(o.ammo)}` : ''}\n${T}    note: ${String(o.note ?? '')}`;
          break;
        case 'persona':
          body = o.spoken !== undefined
            ? `takes:\n${T}    too_safe: ${q(o.too_safe)}\n${T}    too_far:  ${q(o.too_far)}\n${T}    SPOKEN:   ${q(o.spoken)}`
            : o.fills !== undefined
              ? `fill → ${JSON.stringify(o.fills)}`
              : `→ ${JSON.stringify(o).slice(0, 120)}`;
          break;
        case 'interpreter':
          body = `→ ${String(o.expressing ?? '')} · cue ${String(o.cue ?? '?')}${o.coherence !== undefined ? ` · coherence ${String(o.coherence)}` : ''}${Array.isArray(o.thoughts) && o.thoughts.length ? `\n${T}    thinking: ${(o.thoughts as unknown[]).map(q).join(' ')}` : ''}`;
          break;
        case 'profiler': {
          const ups = Array.isArray(o.updates) ? (o.updates as { facet: string; answer: string }[]) : [];
          const el = Array.isArray(o.elevate) ? (o.elevate as { facet: string }[]) : [];
          body = `→ ${ups.map((u) => `${u.facet}=${u.answer}`).join('; ') || 'nothing new'}${el.length ? ` · ask: ${el.map((e) => e.facet).join(',')}` : ''}`;
          break;
        }
        case 'conjector': {
          const bits = [
            o.prev ? `prev ${String(o.prev)}` : '',
            o.guess ? `GUESS ${q(o.guess)}` : '',
            o.class ? `CLASS ${String(o.class)}` : '',
            o.problem_md ? `PROBLEM: ${String(o.problem_md)}` : '',
            o.options_md ? `OPTIONS: ${String(o.options_md)}` : '',
            o.quest_md ? `QUEST: ${String(o.quest_md)}` : '',
          ].filter(Boolean);
          body = `→ ${bits.join(`\n${T}    `) || '(no change)'}`;
          break;
        }
        case 'attention':
          body = '→ frame regenerated';
          break;
        default:
          body = `→ ${JSON.stringify(o).slice(0, 100)}`;
      }
    lines.push({ t: c.startedAt, text: `${T}[${c.agent} ${c.tier} ${ms}] ${body}` });
  }

  lines.sort((a, b) => a.t - b.t);
  const head = [
    `# xray transcript · ${record.input.mode} · ${record.exportedAt}`,
    `${T}class ${record.snapshot.dilemmaClass ?? '—'} · spread ${record.snapshot.spreadClass ?? '—'} · naming ${record.snapshot.namingDelivered ? 'delivered' : 'no'} · ${record.calls.length} calls`,
    '',
  ];
  return [...head, ...lines.map((l) => l.text)].join('\n');
}
