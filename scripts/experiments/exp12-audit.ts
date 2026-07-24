#!/usr/bin/env tsx
// exp12 — anti-rubric audit over every recorded ensemble session.
// Free (no API): reads runs/ensemble-*/session.json, extracts the beats,
// runs the audit metrics, and dumps per-run detail. Findings get curated
// into docs/experiments/exp12-audit.md by hand.
//
//   node --import ./scripts/register-raw-loader.mjs --import tsx scripts/experiments/exp12-audit.ts

import { readdirSync, readFileSync } from 'node:fs';
import { audit, AUDIT_HEADER, auditRow, type SimpleBeat } from './lib';

type SessionRecord = {
  input: { mode: string };
  snapshot: {
    phase: string;
    scroll: ({ kind: 'beat'; speaker: 'oracle' | 'visitor'; text: string } | { kind: 'ev' })[];
    piles: {
      intents: { payload: { move: string; ammo?: string } }[];
      predictions: { payload: { confidence: number; verdict?: string } }[];
      bits: unknown[];
      thoughts: unknown[];
    };
    frames: { trigger: string }[];
    cassandra: { hit: number; graze: number; miss: number };
  };
};

const dirs = readdirSync('runs')
  .filter((d) => d.startsWith('ensemble-') && !d.endsWith('-stub'))
  .sort();

console.log(AUDIT_HEADER);
const details: string[] = [];
const calibration = new Map<number, { judged: number; hitOrGraze: number }>();

for (const dir of dirs) {
  let record: SessionRecord;
  try {
    record = JSON.parse(readFileSync(`runs/${dir}/session.json`, 'utf8')) as SessionRecord;
  } catch {
    continue;
  }
  const beats: SimpleBeat[] = record.snapshot.scroll
    .filter((e): e is Extract<typeof e, { kind: 'beat' }> => e.kind === 'beat')
    .map((b) => ({ speaker: b.speaker, text: b.text }));
  const a = audit(beats);
  const label = dir.replace('ensemble-2026-', '').slice(0, 24);
  console.log(auditRow(label, a));

  const moves = record.snapshot.piles.intents.map((i) => i.payload.move);
  const ammo = record.snapshot.piles.intents.filter((i) => i.payload.ammo).length;
  details.push(
    `\n== ${dir} (${record.input.mode}, ${record.snapshot.phase})`,
    `moves: ${moves.join(' → ')}`,
    `stalls: ${moves.filter((m) => m === 'stall').length} | ammo passed: ${ammo} | bits banked: ${record.snapshot.piles.bits.length} | frames: ${record.snapshot.frames.length}`,
    `cassandra: ${JSON.stringify(record.snapshot.cassandra)}`,
  );
  for (const t of a.adviceHits) details.push(`  ADVICE: ${t}`);
  for (const t of a.doubleQuestions) details.push(`  2?: ${t}`);
  for (const t of a.cardNamed) details.push(`  CARD NAMED: ${t}`);

  for (const p of record.snapshot.piles.predictions) {
    const v = p.payload.verdict;
    if (!v || v === 'superseded') continue;
    const row = calibration.get(p.payload.confidence) ?? { judged: 0, hitOrGraze: 0 };
    row.judged += 1;
    if (v === 'hit' || v === 'graze') row.hitOrGraze += 1;
    calibration.set(p.payload.confidence, row);
  }
}

console.log(details.join('\n'));
console.log('\n== cassandra calibration (all runs pooled)');
for (const [conf, row] of [...calibration.entries()].sort()) {
  console.log(
    `confidence ${conf}: ${row.hitOrGraze}/${row.judged} hit-or-graze (${Math.round((row.hitOrGraze / row.judged) * 100)}%)`,
  );
}
