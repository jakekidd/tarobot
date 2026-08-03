#!/usr/bin/env tsx
// Headless e2e for the ENSEMBLE: runs the full live pipeline (driver,
// persona, six-agent fan, attention, judge) against a real key, with a
// visitor played either from a script or by a model, and serializes
// everything the xray lab would show you:
//
//   runs/ensemble-<stamp>-<mode>/
//     transcript.md   full-fidelity log — scroll + EVERY call (system/user/output)
//     session.json    the same SessionRecord shape the lab's export button writes
//
// The engine is the same object the web lab drives; headless and browser
// are two frontends over one pipeline. --stub validates the runner with
// no network so the harness itself is always testable.
//
// Usage:
//   pnpm e2e:ensemble                            (key from ANTHROPIC_API_KEY or .env.local)
//   pnpm e2e:ensemble -- --apiKey=sk-ant-...
//   pnpm e2e:ensemble -- --mode=session --auto --turns=8
//   pnpm e2e:ensemble -- --stub                  (no key, no network)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClaudeClient } from '../src/pipeline/claude';
import { AnthropicAdapter } from '../src/pipeline/llm/adapter-anthropic';
import type { LLMAdapter } from '../src/pipeline/llm/adapter';
import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultChatInput, defaultSessionInput } from '../src/pipeline/ensemble/fixtures';
import { buildSessionLog, serializeSession } from '../src/pipeline/ensemble/serialize';
import type { CallRecord } from '../src/pipeline/ensemble/types';
import { EnsembleStubAdapter } from './e2e/ensemble-stub';

// ─── args / key ─────────────────────────────────────────────────

type Args = {
  apiKey?: string;
  mode: 'chat' | 'session';
  turns: number;
  auto: boolean;
  stub: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { mode: 'chat', turns: 6, auto: false, stub: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--apiKey=')) out.apiKey = a.slice('--apiKey='.length);
    else if (a === '--apiKey') out.apiKey = argv[++i];
    else if (a.startsWith('--mode=')) out.mode = a.slice('--mode='.length) as Args['mode'];
    else if (a.startsWith('--turns=')) out.turns = Number(a.slice('--turns='.length));
    else if (a === '--auto') out.auto = true;
    else if (a === '--stub') out.stub = true;
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
    /* no .env.local — fine */
  }
  return undefined;
}

// ─── the visitor ────────────────────────────────────────────────

// scripted maya — enough charge to exercise press/stall/honor, with one
// deflection so cassandra has something predictable to predict.
const SCRIPT: { line?: string; flip?: number; silence?: boolean }[] = [
  { line: 'hi. okay. i was not going to do this but my friend made me, so.' },
  {
    line:
      'the year has been fine. busy. my sister called last night and i told her i was fine, ' +
      'which is what we say. i have kind of been holding the family since dad died.',
  },
  { flip: 1 },
  { line: 'ha. okay. that is — hm. someone has to, right?' },
  { silence: true },
  { line: 'the job is fine too. everything is fine. i keep saying fine.' },
  { flip: 2 },
  { line: 'honestly i already know what i want to do. i just have not said it out loud.' },
  { flip: 3 },
  { line: 'if i leave, who catches it all? that is the thing nobody answers.' },
  { flip: 4 },
  { line: 'okay. yes. that lands. i hate that it lands.' },
  { line: 'thank you. i think i knew i needed to hear that.' },
];

const VISITOR_SYSTEM =
  'you are maya, mid-thirties, at a tarot table. hidden truth: you have already ' +
  'decided to quit your job, and you carry your family (a load-bearing older ' +
  'sister, a checked-out mom) since your dad died; you deflect with "fine" and ' +
  'small jokes, and you only open up when a read lands without pity. reply with ' +
  "ONLY maya's next spoken line, 1-2 sentences, lowercase, no stage directions.";

// ─── settle ─────────────────────────────────────────────────────

function settle(engine: EnsembleEngine, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const s = engine.snapshot();
      if (s.busy === null && !s.fanInFlight && !s.attentionInFlight) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('engine did not settle'));
      setTimeout(poll, 25);
    };
    poll();
  });
}

// ─── main ───────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let adapter: LLMAdapter;
  if (args.stub) {
    adapter = new EnsembleStubAdapter();
    console.log('mode: STUB (no network)');
  } else {
    const key = resolveKey(args.apiKey);
    if (!key) {
      console.error('no api key: pass --apiKey=, set ANTHROPIC_API_KEY, or add it to .env.local');
      process.exit(1);
    }
    adapter = new AnthropicAdapter(createClaudeClient(key));
  }

  // blind start — the real thing
  const input = args.mode === 'session' ? defaultSessionInput() : defaultChatInput();

  const calls = new Map<string, CallRecord>();
  const engine = new EnsembleEngine({
    adapter,
    input,
    telemetry: {
      onCallStart: (rec) => {
        calls.set(rec.id, rec);
        console.log(`  ▸ ${rec.agent} (${rec.tier})…`);
      },
      onCallChunk: (id, chunk) => {
        const rec = calls.get(id);
        if (rec) rec.streamed += chunk;
      },
      onCallEnd: (id, output) => {
        const rec = calls.get(id);
        if (!rec) return;
        rec.output = output;
        rec.endedAt = Date.now();
        const preview =
          typeof output === 'string' ? output.slice(0, 90) : JSON.stringify(output).slice(0, 90);
        console.log(`  ✓ ${rec.agent} ${rec.endedAt - rec.startedAt}ms — ${preview}`);
      },
      onCallError: (id, error) => {
        const rec = calls.get(id);
        if (rec) {
          rec.error = error;
          rec.endedAt = Date.now();
        }
        console.log(`  ✗ ${calls.get(id)?.agent}: ${error}`);
      },
    },
  });

  const say = (who: string, text: string) => console.log(`\n${who}: ${text}`);

  console.log(`\n=== ensemble e2e · ${input.mode} · visitor: ${args.auto ? 'model' : 'scripted'} ===`);
  engine.start();
  await settle(engine, 120_000);
  logOracle(engine, say);

  // scripted mode always plays the WHOLE track (the close needs flip 4);
  // --turns sizes the model-driven visitor only
  const steps = args.auto
    ? Array.from({ length: args.turns }, () => ({ auto: true as const }))
    : SCRIPT.filter((s) => input.mode === 'session' || s.flip === undefined);

  for (const step of steps) {
    const snap = engine.snapshot();
    if (snap.phase !== 'live') break;

    if ('auto' in step) {
      const line = await visitorModel(adapter, engine);
      say('visitor', line);
      engine.visitorLine(line);
    } else if (step.flip !== undefined) {
      say('⟨flip⟩', String(step.flip));
      engine.flip(step.flip);
    } else if (step.silence) {
      say('⟨silence⟩', '');
      engine.silenceTick();
    } else if (step.line) {
      say('visitor', step.line);
      engine.visitorLine(step.line);
    }
    await settle(engine, 120_000);
    logOracle(engine, say);
  }

  // serialize — the SAME SessionRecord the lab's export button writes
  const record = serializeSession(input, engine.snapshot(), [...calls.values()]);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = `runs/ensemble-${stamp}-${input.mode}${args.stub ? '-stub' : ''}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/session.json`, JSON.stringify(record, null, 2));
  writeFileSync(`${dir}/transcript.md`, buildSessionLog(record));

  const errors = [...calls.values()].filter((c) => c.error);
  console.log(`\n=== done · ${calls.size} calls · ${errors.length} errors ===`);
  console.log(`wrote ${dir}/transcript.md and session.json`);
  if (errors.length > 0) {
    for (const e of errors) console.log(`  error: ${e.agent} — ${e.error}`);
    process.exitCode = 1;
  }
}

let lastSpokenCount = 0;
function logOracle(engine: EnsembleEngine, say: (who: string, text: string) => void): void {
  const beats = engine
    .snapshot()
    .scroll.filter((e) => e.kind === 'beat' && e.speaker === 'oracle');
  for (let i = lastSpokenCount; i < beats.length; i++) {
    const b = beats[i]!;
    if (b.kind === 'beat') say('oracle', b.text);
  }
  lastSpokenCount = beats.length;
}

async function visitorModel(adapter: LLMAdapter, engine: EnsembleEngine): Promise<string> {
  const transcript = engine
    .snapshot()
    .scroll.filter((e) => e.kind === 'beat')
    .map((e) => (e.kind === 'beat' ? `${e.speaker}: ${e.text}` : ''))
    .join('\n');
  const line = await adapter.invokeFreeform({
    system: VISITOR_SYSTEM,
    user: `the conversation so far:\n${transcript}\n\nmaya's next line:`,
    model: 'fast',
    max_tokens: 150,
    label: 'e2e_visitor',
  });
  return line.trim();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
