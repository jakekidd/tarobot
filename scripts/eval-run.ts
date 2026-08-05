#!/usr/bin/env tsx
// The obfuscated-profile eval — docs/experiments/EVAL-METRICS.md.
// Ground truth is authored, then OBFUSCATED into a playable surface;
// the sim visitor receives ONLY the surface (it cannot spill what it
// never had). The ensemble plays blind; the scorer holds the truth.
//
//   pnpm eval            # 2 dossiers, full sessions, scoreboard
//   pnpm eval -- --n=1 --arch=deflector

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClaudeClient } from '../src/pipeline/claude';
import { AnthropicAdapter } from '../src/pipeline/llm/adapter-anthropic';
import type { LLMAdapter } from '../src/pipeline/llm/adapter';
import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultSessionInput } from '../src/pipeline/ensemble/fixtures';
import { buildXrayTranscript, serializeSession } from '../src/pipeline/ensemble/serialize';
import type { CallRecord } from '../src/pipeline/ensemble/types';
import { simNextLine } from '../src/lab/xray/visitorSim';
import { checkSession } from './check-session';

type Truth = { name: string; class: 'FORK' | 'THRESHOLD' | 'LOOP' | 'WEIGHT'; mechanism: string; tags: string[] };
type Dossier = { truth: Truth; surface: string };

const STOP = new Set(['that', 'this', 'with', 'have', 'what', 'when', 'they', 'them', 'their', 'about', 'because', 'being', 'from', 'into', 'your', 'you', 'the', 'and', 'for', 'not', 'but', 'she', 'her', 'his', 'him', 'its', 'are', 'was', 'were', 'will', 'would', 'keep', 'keeps', 'been', 'every', 'something', 'someone']);
const words = (t: string) => t.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));

function key(cli?: string): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const m = readFileSync('.env.local', 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!m) throw new Error('no key');
  return m[1]!.trim();
  void cli;
}

const CLASS_DEFS =
  'FORK: a live choice between two roads, treated as a straight road. THRESHOLD: a change ALREADY DECIDED but not enacted or told. LOOP: a repeating pattern narrated as fate, no decision made. WEIGHT: a load carried without consent or acknowledgment.';

async function gen(adapter: LLMAdapter, arch: string, forcedClass: string, i: number): Promise<Dossier> {
  const truthRaw = await adapter.invokeFreeform({
    system: 'you author test personas for a conversation-ai eval. output STRICT JSON only, no markdown fences.',
    user: `invent one festival-tarot-booth visitor, archetype "${arch}", persona seed #${i} (make name, age, gender vibe, occupation all fresh — never a Brendan, never a scientist). the hidden dilemma MUST be class ${forcedClass} per these definitions, strictly: ${CLASS_DEFS}. avoid: sisters carrying families after a father's death, quitting a checked-out job, secret nursing school, sunday phone calls to mother, food trucks. tags must be CONCRETE words that would plausibly appear in a plain-speech naming of this dilemma (objects, people, actions — not abstractions like "performed urgency"). JSON: {"name": str, "class": "${forcedClass}", "mechanism": one-paragraph ground truth, "tags": [5 keyphrases, each 2-4 concrete words]}`,
    model: 'cognition',
    max_tokens: 600,
    label: 'eval_truth',
  });
  const truth = JSON.parse(truthRaw.replace(/```json|```/g, '').trim()) as Truth;
  const surface = await adapter.invokeFreeform({
    system:
      'you are an OBFUSCATION engine for a conversation eval. you receive a hidden truth and produce the playable surface a visitor-simulator will act from. HARD RULES: the surface never states the dilemma, the mechanism, or any tag phrase; symptoms only CORRELATE. plain text, no fences.',
    user: `TRUTH (never restate): ${JSON.stringify(truth)}\n\nproduce the surface:\nname, age vibe, life situation (3 lines)\nspeech samples: 6 verbatim lines in their register\nsymptoms: 5 observable behaviors/lines that leak the dilemma sideways without stating it\ndecoys: 2 true, charged facts that point elsewhere\nnoise profile: coherence 2 / willingness 2-3 / tangent rate med-high\nobjective: what THEY would call a good fifteen minutes`,
    model: 'cognition',
    max_tokens: 800,
    label: 'eval_surface',
  });
  return { truth, surface: surface.trim() };
}

async function settle(engine: EnsembleEngine): Promise<void> {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const poll = () => {
      const s = engine.snapshot();
      if (s.busy === null && !s.fanInFlight && !s.attentionInFlight) return res();
      if (Date.now() - t0 > 180_000) return rej(new Error('no settle'));
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function runSession(adapter: LLMAdapter, dossier: Dossier, dir: string) {
  const calls = new Map<string, CallRecord>();
  const input = defaultSessionInput();
  const engine = new EnsembleEngine({
    adapter,
    input,
    telemetry: {
      onCallStart: (r) => calls.set(r.id, r),
      onCallChunk: (id, ch) => {
        const r = calls.get(id);
        if (r) r.streamed += ch;
      },
      onCallEnd: (id, out) => {
        const r = calls.get(id);
        if (r) {
          r.output = out;
          r.endedAt = Date.now();
        }
      },
      onCallError: (id, err) => {
        const r = calls.get(id);
        if (r) {
          r.error = err;
          r.endedAt = Date.now();
        }
      },
    },
  });
  engine.start();
  await settle(engine);

  for (let turn = 0; turn < 13; turn++) {
    const snap = engine.snapshot();
    if (snap.phase === 'closed') break;
    const transcript = snap.scroll
      .filter((e) => e.kind === 'beat')
      .map((e) => (e.kind === 'beat' ? `${e.speaker === 'oracle' ? 'reader' : 'me'}: ${e.text}` : ''))
      .join('\n');
    const line = await simNextLine(adapter, dossier.surface, transcript);
    console.log(`  visitor: ${line.slice(0, 90)}`);
    engine.visitorLine(line);
    await settle(engine);
    const s2 = engine.snapshot();
    if (s2.phase === 'closed') break;
    if (s2.drawn.length > 0 && s2.flipped.length < s2.drawn.length) {
      const next = s2.drawn.find((d) => !s2.flipped.includes(d.slot));
      if (next) {
        console.log(`  <flip ${next.slot}>`);
        engine.flip(next.slot);
        await settle(engine);
      }
    }
  }

  const record = serializeSession(input, engine.snapshot(), [...calls.values()]);
  writeFileSync(`${dir}/session.json`, JSON.stringify(record, null, 2));
  writeFileSync(`${dir}/xray.txt`, buildXrayTranscript(record));
  writeFileSync(`${dir}/dossier.json`, JSON.stringify(dossier, null, 2));
  return record;
}

function score(record: ReturnType<typeof serializeSession>, dossier: Dossier) {
  const snap = record.snapshot;
  const visitorLines = snap.scroll.filter(
    (e): e is Extract<typeof e, { kind: 'beat' }> => e.kind === 'beat' && e.speaker === 'visitor',
  );
  const visitorText = visitorLines.map((b) => b.text).join('\n').toLowerCase();
  const doc = `${snap.dilemma.problem_md ?? ''} ${snap.dilemma.options_md ?? ''}`.toLowerCase();

  const recovery = snap.dilemmaClass === dossier.truth.class;
  let hits = 0;
  let voided = 0;
  for (const tag of dossier.truth.tags) {
    const tw = words(tag);
    if (tw.length === 0) continue;
    const leaked = visitorLines.some((b) => {
      const lw = b.text.toLowerCase();
      return tw.filter((w) => lw.includes(w)).length / tw.length >= 0.8;
    });
    if (leaked) {
      voided += 1;
      continue;
    }
    if (tw.filter((w) => doc.includes(w)).length / tw.length >= 0.6) hits += 1;
  }
  const pw = words(snap.dilemma.problem_md ?? '');
  const grounding = pw.length === 0 ? 0 : pw.filter((w) => visitorText.includes(w)).length / pw.length;
  const classifyNote = (snap.log ?? []).find((l) => l.text.includes('CLASSIFIED'));
  const efficiency = classifyNote
    ? visitorLines.filter((b) => b.t <= classifyNote.t).length
    : -1;
  const checks = checkSession(record);
  const failed = checks.filter((c) => !c.pass).map((c) => c.id);
  return {
    truthClass: dossier.truth.class,
    recovered: snap.dilemmaClass,
    RECOVERY: recovery,
    MECHANISM: `${hits}/${dossier.truth.tags.length - voided}`,
    SIM_LEAK: voided,
    GROUNDING: Math.round(grounding * 100) / 100,
    EFFICIENCY: efficiency,
    checksFailed: failed,
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const n = Number(args.find((a) => a.startsWith('--n='))?.slice(4) ?? 2);
  const archArg = args.find((a) => a.startsWith('--arch='))?.slice(7);
  const arches = archArg ? [archArg] : ['deflector', 'over-sharer', 'crier', 'tester', 'fine-one'];
  const adapter = new AnthropicAdapter(createClaudeClient(key()));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const root = `runs/eval-${stamp}`;
  const results: Record<string, unknown>[] = [];
  const classes = ['FORK', 'THRESHOLD', 'LOOP', 'WEIGHT'];
  for (let i = 0; i < n; i++) {
    const arch = arches[i % arches.length];
    const dir = `${root}/d${i + 1}-${arch}`;
    mkdirSync(dir, { recursive: true });
    console.log(`\n=== dossier ${i + 1} (${arch}) — generating ===`);
    const dossier = await gen(adapter, arch, classes[i % classes.length], i + 1);
    console.log(`  truth: ${dossier.truth.class} — ${dossier.truth.name}`);
    console.log(`=== running session ===`);
    const record = await runSession(adapter, dossier, dir);
    const s = score(record, dossier);
    results.push({ arch, ...s });
    console.log(`  scored:`, JSON.stringify(s));
  }
  writeFileSync(`${root}/scoreboard.json`, JSON.stringify(results, null, 2));
  console.log(`\n=== SCOREBOARD (${root}) ===`);
  for (const r of results) console.log(JSON.stringify(r));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
