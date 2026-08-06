#!/usr/bin/env tsx
// exp01 — the arms protocol. Same brief, same scripted visitor track,
// three arms: naive (one call per beat), baseline (src/pipeline/oracle),
// ensemble (this build). Writes beats-only transcripts per run into a
// shared out dir, plus audits.json; --bundle shuffles them into a blind
// set for human ranking (mapping sealed in its own file).
//
//   pnpm exp:arms -- --arms=naive --repeats=2 --out=exp01-a
//   pnpm exp:arms -- --arms=baseline --repeats=2 --out=exp01-a
//   pnpm exp:arms -- --arms=ensemble --repeats=1 --out=exp01-a   (run twice)
//   pnpm exp:arms -- --bundle --out=exp01-a

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClaudeClient } from '../../src/pipeline/claude';
import { AnthropicAdapter } from '../../src/pipeline/llm/adapter-anthropic';
import type { LLMAdapter } from '../../src/pipeline/llm/adapter';
import { OracleEngine } from '../../src/pipeline/oracle/engine';
import { FIXTURE_BRIEF } from '../../src/pipeline/oracle/fixtures';
import { EnsembleEngine } from '../../src/pipeline/ensemble/engine';
import { defaultDocs, defaultSessionInput } from '../../src/pipeline/ensemble/fixtures';
import WILDCARD_RAW from '../../materials/prompts/ensemble/wildcard.md?raw';
import { audit, AUDIT_HEADER, auditRow, MAYA_TRACK, resolveKey, argNum, until, type SimpleBeat } from './lib';

type Arm = 'naive' | 'baseline' | 'ensemble';

// ─── naive arm ──────────────────────────────────────────────────

const NAIVE_CARD =
  WILDCARD_RAW.slice(0, WILDCARD_RAW.indexOf('[each beat]')).trim() +
  '\n\n[delivery]\nyou receive the brief and the conversation. speak the ' +
  "oracle's next line and nothing else: no quotes, no stage directions, no " +
  'markdown. keep it under 40 words. lowercase.';

async function runNaive(adapter: LLMAdapter): Promise<SimpleBeat[]> {
  const b = FIXTURE_BRIEF;
  const beats: SimpleBeat[] = [];
  const transcript: string[] = [];
  const speak = (text: string) => {
    beats.push({ speaker: 'oracle', text });
    transcript.push(`oracle: ${text}`);
  };
  speak(b.opening);

  const briefText = [
    `portrait: ${b.portrait}`,
    `fork: ${b.fork ? `${b.fork.surface} — under it: ${b.fork.reframe}` : 'none'}`,
    `leads: ${b.leads.join(' | ')}`,
    `mantra: ${b.mantra}`,
    `taboos: ${b.taboos.join('; ') || 'none'}`,
  ].join('\n');

  for (const step of MAYA_TRACK) {
    if (step.line) {
      beats.push({ speaker: 'visitor', text: step.line });
      transcript.push(`visitor: ${step.line}`);
    } else if (step.flip !== undefined) {
      const card = b.cards.find((c) => c.slot === step.flip)!;
      transcript.push(`[the visitor turns card ${step.flip}. the deck notes: ${card.guide}]`);
    } else if (step.silence) {
      transcript.push('[the visitor says nothing for a while]');
    }
    const line = await adapter.invokeFreeform({
      system: NAIVE_CARD,
      user: `BRIEF:\n${briefText}\n\nCONVERSATION:\n${transcript.join('\n')}\n\nthe oracle's next line:`,
      model: 'cognition',
      max_tokens: 300,
      label: 'exp01_naive',
    });
    speak(line.trim().replace(/^oracle:\s*/i, ''));
  }
  return beats;
}

// ─── baseline arm ───────────────────────────────────────────────

async function runBaseline(adapter: LLMAdapter): Promise<SimpleBeat[]> {
  const engine = new OracleEngine({ adapter, brief: FIXTURE_BRIEF, mode: 'session' });
  engine.start();
  const settled = () => engine.snapshot().busy === null;
  await until(settled, 120_000);
  for (const step of MAYA_TRACK) {
    if (engine.snapshot().phase !== 'live') break;
    if (step.line) engine.visitorLine(step.line);
    else if (step.flip !== undefined) engine.flip(step.flip);
    else if (step.silence) engine.silenceTick();
    await until(settled, 120_000);
  }
  return engine
    .snapshot()
    .scroll.filter((e): e is Extract<typeof e, { kind: 'beat' }> => e.kind === 'beat')
    .map((bt) => ({ speaker: bt.speaker === 'oracle' ? ('oracle' as const) : ('visitor' as const), text: bt.text }));
}

// ─── ensemble arm ───────────────────────────────────────────────

async function runEnsemble(adapter: LLMAdapter): Promise<SimpleBeat[]> {
  const engine = new EnsembleEngine({
    adapter,
    input: defaultSessionInput('ensemble', defaultDocs().slice(0, 1)),
  });
  const settled = () => {
    const s = engine.snapshot();
    return s.busy === null && !s.fanInFlight && !s.attentionInFlight;
  };
  engine.start();
  await until(settled, 180_000);
  for (const step of MAYA_TRACK) {
    if (engine.snapshot().phase !== 'live') break;
    if (step.line) engine.visitorLine(step.line);
    else if (step.flip !== undefined) engine.flip(step.flip);
    else if (step.silence) engine.silenceTick();
    await until(settled, 180_000);
  }
  return engine
    .snapshot()
    .scroll.filter((e): e is Extract<typeof e, { kind: 'beat' }> => e.kind === 'beat')
    .map((bt) => ({ speaker: bt.speaker, text: bt.text }));
}

// ─── harness ────────────────────────────────────────────────────

function transcriptMd(beats: SimpleBeat[]): string {
  return beats.map((b) => `**${b.speaker}:** ${b.text}`).join('\n\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const outName = argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'exp01';
  const outDir = `runs/experiments/${outName}`;
  mkdirSync(outDir, { recursive: true });

  if (argv.includes('--bundle')) {
    const files = readdirSync(outDir).filter((f) => f.startsWith('transcript-'));
    const shuffled = [...files].sort(() => Math.random() - 0.5);
    mkdirSync(`${outDir}/blind`, { recursive: true });
    const mapping: Record<string, string> = {};
    shuffled.forEach((f, i) => {
      const anon = String.fromCharCode(65 + i);
      mapping[anon] = f;
      const body = readFileSync(`${outDir}/${f}`, 'utf8');
      writeFileSync(`${outDir}/blind/${anon}.md`, `# transcript ${anon}\n\n${body}\n`);
    });
    writeFileSync(`${outDir}/blind/MAPPING-sealed.json`, JSON.stringify(mapping, null, 2));
    console.log(`blind bundle: ${outDir}/blind/ (${shuffled.length} transcripts; mapping sealed)`);
    return;
  }

  const key = resolveKey(argv);
  if (!key) {
    console.error('no api key');
    process.exit(1);
  }
  const arms = (argv.find((a) => a.startsWith('--arms='))?.slice(7).split(',') ?? [
    'naive',
    'baseline',
    'ensemble',
  ]) as Arm[];
  const repeats = argNum(argv, 'repeats', 1);
  const adapter = new AnthropicAdapter(createClaudeClient(key));
  const runners: Record<Arm, (a: LLMAdapter) => Promise<SimpleBeat[]>> = {
    naive: runNaive,
    baseline: runBaseline,
    ensemble: runEnsemble,
  };

  console.log(AUDIT_HEADER);
  for (const arm of arms) {
    for (let r = 1; r <= repeats; r++) {
      const existing = readdirSync(outDir).filter((f) => f.startsWith(`transcript-${arm}-`)).length;
      const n = existing + 1;
      const started = Date.now();
      const beats = await runners[arm](adapter);
      const a = audit(beats);
      console.log(auditRow(`${arm}-r${n} (${Math.round((Date.now() - started) / 1000)}s)`, a));
      writeFileSync(`${outDir}/transcript-${arm}-r${n}.md`, transcriptMd(beats));
      writeFileSync(`${outDir}/audit-${arm}-r${n}.json`, JSON.stringify(a, null, 2));
    }
  }
  console.log(`\nartifacts in ${outDir}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
