#!/usr/bin/env tsx
// The live table — sit across from the ensemble, headless. Built so an
// agent (or a human in a second terminal) can PLAY a session turn by
// turn and then audit the thinking: every beat, every intent, every
// rejected persona take, in one chronological file.
//
//   pnpm live                          # key from ANTHROPIC_API_KEY / .env.local
//   pnpm live -- --stub                # no key, no network (harness check)
//   pnpm live -- --driver-tier=fast    # A/B: haiku driver
//
// It prints the oracle's beats and the offstage thinking to stdout and
// takes commands by watching <run-dir>/inbox.txt for appended lines:
//
//   say <text>     speak as the visitor
//   flip <1-4>     flip a card
//   tick           let the silence run one beat
//   end            close out: writes session.json, transcript.md, audit.md
//
// The audit (audit.md) is the point: a compact timeline for answering
// docs/experiments/NORTH-STAR.md's question — which thinking changed
// behavior, and which was noise.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClaudeClient } from '../src/pipeline/claude';
import { AnthropicAdapter } from '../src/pipeline/llm/adapter-anthropic';
import type { LLMAdapter } from '../src/pipeline/llm/adapter';
import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultSessionInput } from '../src/pipeline/ensemble/fixtures';
import { buildSessionLog, buildXrayTranscript, serializeSession, type SessionRecord } from '../src/pipeline/ensemble/serialize';
import type {
  AgentName,
  CallRecord,
  Intent,
  PersonaLine,
  Read,
} from '../src/pipeline/ensemble/types';
import { EnsembleStubAdapter } from './e2e/ensemble-stub';

type Args = { apiKey?: string; stub: boolean; driverTier?: 'fast' | 'cognition' | 'deep' };

function parseArgs(argv: string[]): Args {
  const out: Args = { stub: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--apiKey=')) out.apiKey = a.slice('--apiKey='.length);
    else if (a === '--stub') out.stub = true;
    else if (a.startsWith('--driver-tier='))
      out.driverTier = a.slice('--driver-tier='.length) as Args['driverTier'];
  }
  return out;
}

function resolveKey(cli?: string): string | undefined {
  if (cli) return cli;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const m = readFileSync('.env.local', 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) return m[1]!.trim();
  } catch {
    /* fine */
  }
  return undefined;
}

// ─── the audit ──────────────────────────────────────────────────

function buildAudit(record: SessionRecord): string {
  const t0 = Math.min(
    ...record.snapshot.scroll.map((e) => e.t),
    ...record.calls.map((c) => c.startedAt),
  );
  const at = (t: number) => `+${((t - t0) / 1000).toFixed(1)}s`;
  const q = (s: string) => `"${s}"`;

  type Line = { t: number; text: string };
  const lines: Line[] = [];

  for (const e of record.snapshot.scroll) {
    if (e.kind === 'beat') lines.push({ t: e.t, text: `${e.speaker.toUpperCase()}: ${e.text}` });
    else lines.push({ t: e.t, text: `⟨${e.ev}${e.slot !== undefined ? ` ${e.slot}` : ''}⟩` });
  }

  for (const c of record.calls) {
    const ms = c.endedAt !== undefined ? `${((c.endedAt - c.startedAt) / 1000).toFixed(1)}s` : '…';
    if (c.error) {
      lines.push({ t: c.startedAt, text: `  ${c.agent} ${ms} → ERROR ${c.error}` });
      continue;
    }
    if (c.output === undefined) {
      lines.push({ t: c.startedAt, text: `  ${c.agent} ${ms} → (in flight at session end)` });
      continue;
    }
    switch (c.agent) {
      case 'driver': {
        const i = c.output as Intent;
        lines.push({
          t: c.startedAt,
          text: `  driver ${ms} → ${i.beat}${i.frame ? `/${i.frame}` : ''}${i.target ? ` @ ${i.target}` : ''} · do ${q(i.accomplish)}${i.ammo ? ` · ammo ${q(i.ammo)}` : ''}\n    note: ${i.note}`,
        });
        break;
      }
      case 'persona': {
        const p = c.output as PersonaLine;
        lines.push({
          t: c.startedAt,
          text: `  persona ${ms}\n    too_safe: ${q(p.too_safe)}\n    too_far:  ${q(p.too_far)}\n    SPOKEN:   ${q(p.spoken)}`,
        });
        break;
      }
      case 'interpreter': {
        const r = c.output as Read;
        lines.push({
          t: c.startedAt,
          text: `  interpreter ${ms} → ${r.expressing} · cue ${r.cue}${r.frame_stale ? ' · FRAME STALE' : ''}${r.thoughts.length ? `\n    thinking: ${r.thoughts.map(q).join(' ')}` : ''}`,
        });
        break;
      }
      case 'profiler': {
        const f = c.output as { updates?: { facet: string; answer: string }[]; elevate?: { facet: string; angle: string }[] };
        const ups = (f.updates ?? []).map((u) => `${u.facet}=${u.answer}`).join('; ');
        const el = (f.elevate ?? []).map((e) => e.facet).join(',');
        lines.push({ t: c.startedAt, text: `  profiler ${ms} → ${ups || 'nothing new'}${el ? ` · ask: ${el}` : ''}` });
        break;
      }
      case 'conjector': {
        const o = c.output as { prev?: string; guess?: string; problem_md?: string; options_md?: string; quest_md?: string };
        const bits = [
          o.prev ? `prev ${o.prev}` : '',
          o.guess ? `GUESS ${q(o.guess)}` : '',
          o.problem_md ? `PROBLEM: ${o.problem_md}` : '',
          o.options_md ? `OPTIONS: ${o.options_md}` : '',
          o.quest_md ? `QUEST: ${o.quest_md}` : '',
        ].filter(Boolean);
        lines.push({ t: c.startedAt, text: `  conjector ${ms} → ${bits.join('\n    ') || '(no change)'}` });
        break;
      }
      case 'attention':
        lines.push({ t: c.startedAt, text: `  attention ${ms} → frame regenerated` });
        break;
    }
  }

  lines.sort((a, b) => a.t - b.t);

  const byAgent = new Map<AgentName, { n: number; ms: number }>();
  for (const c of record.calls) {
    const row = byAgent.get(c.agent) ?? { n: 0, ms: 0 };
    row.n += 1;
    if (c.endedAt !== undefined) row.ms += c.endedAt - c.startedAt;
    byAgent.set(c.agent, row);
  }

  return [
    '# thinking audit',
    '',
    'yardstick: docs/experiments/NORTH-STAR.md — for every call below,',
    'did its output CHANGE what the driver or persona did?',
    '',
    '```',
    ...lines.map((l) => `[${at(l.t)}] ${l.text}`),
    '```',
    '',
    '## resourcing',
    '',
    ...[...byAgent].map(([a, r]) => `- ${a}: ${r.n} calls · ${(r.ms / 1000).toFixed(1)}s total`),
    '',
  ].join('\n');
}

// ─── main ───────────────────────────────────────────────────────

function settle(engine: EnsembleEngine, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const s = engine.snapshot();
      if (s.busy === null) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('engine did not settle'));
      setTimeout(poll, 50);
    };
    poll();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let adapter: LLMAdapter;
  if (args.stub) {
    adapter = new EnsembleStubAdapter();
    console.log('mode: STUB');
  } else {
    const key = resolveKey(args.apiKey);
    if (!key) {
      console.error('no api key: pass --apiKey=, set ANTHROPIC_API_KEY, or add it to .env.local');
      process.exit(1);
    }
    adapter = new AnthropicAdapter(createClaudeClient(key));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = `runs/live-${stamp}${args.stub ? '-stub' : ''}${args.driverTier ? `-drv-${args.driverTier}` : ''}`;
  mkdirSync(dir, { recursive: true });
  const inbox = `${dir}/inbox.txt`;
  writeFileSync(inbox, '');

  // blind start — the real thing. no docs, no brief; cards drawn live.
  const input = defaultSessionInput();

  const calls = new Map<string, CallRecord>();
  const engine = new EnsembleEngine({
    adapter,
    input,
    tiers: args.driverTier ? { driver: args.driverTier } : undefined,
    telemetry: {
      onCallStart: (rec) => calls.set(rec.id, rec),
      onCallChunk: (id, chunk) => {
        const rec = calls.get(id);
        if (rec) rec.streamed += chunk;
      },
      onCallEnd: (id, output) => {
        const rec = calls.get(id);
        if (!rec) return;
        rec.output = output;
        rec.endedAt = Date.now();
        if (rec.agent === 'conjector') {
          const o = output as { guess?: string; class?: string; problem_md?: string; quest_md?: string };
          if (o.guess) console.log(`  [conjector] guess: "${o.guess}"`);
          if (o.class) console.log(`  [conjector] CLASSIFIED: ${o.class}`);
          if (o.problem_md) console.log(`  [conjector] problem committed`);
          if (o.quest_md) console.log(`  [conjector] quest drafted`);
        } else if (rec.agent === 'driver') {
          const i = output as Intent;
          console.log(`  [driver] ${i.beat}${i.frame ? `/${i.frame}` : ''} · ${i.accomplish}${i.ammo ? ` · ammo "${i.ammo}"` : ''}`);
        } else if (rec.agent === 'interpreter') {
          const r = output as Read;
          console.log(`  [interpreter] ${r.expressing} · cue ${r.cue}`);
        }
      },
      onCallError: (id, error) => {
        const rec = calls.get(id);
        if (rec) {
          rec.error = error;
          rec.endedAt = Date.now();
        }
        console.log(`  [error] ${calls.get(id)?.agent}: ${error}`);
      },
    },
  });

  let dealShown = false;
  let printed = 0;
  engine.subscribe((snap) => {
    const beats = snap.scroll.filter((e) => e.kind === 'beat');
    for (; printed < beats.length; printed++) {
      const b = beats[printed]!;
      if (b.kind === 'beat') console.log(`\n${b.speaker.toUpperCase()}: ${b.text}`);
    }
  });

  console.log(`\n=== live table · ${input.mode} · blind${args.driverTier ? ` · driver=${args.driverTier}` : ''} ===`);
  engine.subscribe((snap) => {
    if (snap.drawn.length > 0 && !dealShown) {
      dealShown = true;
      console.log(`\n  [deal] ${snap.spreadClass}: ${snap.drawn.map((d) => `${d.slot}:${d.card.id} (${d.position})`).join('  ')}`);
    }
  });
  console.log(`commands → append to ${inbox}`);
  console.log(`  say <text> | flip <1-4> | tick | end\n`);

  engine.start();

  let offset = 0;
  let ended = false;
  while (!ended) {
    await new Promise((r) => setTimeout(r, 250));
    let content = '';
    try {
      content = readFileSync(inbox, 'utf8');
    } catch {
      continue;
    }
    const fresh = content.slice(offset);
    if (!fresh.includes('\n')) continue;
    const upto = fresh.lastIndexOf('\n') + 1;
    offset += upto;
    for (const raw of fresh.slice(0, upto).split('\n')) {
      const cmd = raw.trim();
      if (!cmd) continue;
      if (cmd === 'end') {
        ended = true;
        break;
      }
      if (cmd === 'tick') {
        engine.silenceTick();
      } else if (cmd.startsWith('flip ')) {
        const slot = Number(cmd.slice(5)) as 1 | 2 | 3 | 4;
        if ([1, 2, 3, 4].includes(slot)) engine.flip(slot);
      } else if (cmd.startsWith('say ')) {
        engine.visitorLine(cmd.slice(4));
      } else {
        console.log(`  [?] unknown command: ${cmd}`);
      }
      await settle(engine, 180_000);
    }
    if (engine.snapshot().phase === 'closed') {
      console.log('\n(the session closed itself)');
      ended = true;
    }
  }

  const record = serializeSession(input, engine.snapshot(), [...calls.values()]);
  writeFileSync(`${dir}/session.json`, JSON.stringify(record, null, 2));
  writeFileSync(`${dir}/transcript.md`, buildSessionLog(record));
  writeFileSync(`${dir}/audit.md`, buildAudit(record));
  writeFileSync(`${dir}/xray.txt`, buildXrayTranscript(record));
  appendFileSync(inbox, '# session ended\n');
  console.log(`\nwrote ${dir}/{session.json, transcript.md, audit.md}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
