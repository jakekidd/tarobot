// Headless survey driver — a CLI rig for walking through the antechamber
// engine turn-by-turn with full x-ray vision into per-turn cognition.
//
// Why this exists: the bot harness (scripts/e2e-survey.ts) uses two
// LLMs to autonomously walk a survey (Opus archetype + Haiku answerer).
// That's expensive and you can't drive it interactively. This driver
// lets a human or an LLM agent BE THE ANSWERER while still seeing
// every agent event, the LivingDoc delta, the coverage map, and the
// dowser's next_move per turn. Useful for:
//   - validating cognition behavior after refactors
//   - auditing specific corner cases (returning user, free-text harvest)
//   - iterating on prompts without burning the bot's archetype budget
//
// State persists to disk between CLI invocations, so each turn is a
// single bash call. This makes the driver agent-friendly — you can
// `Bash` it from any tool that supports shell.
//
// Usage:
//   pnpm driver init [sid]
//   pnpm driver step <sid|latest> <answer>
//   pnpm driver intent <sid|latest> <intention>
//   pnpm driver dump <sid|latest>
//   pnpm driver list
//
// Env:
//   ANTHROPIC_API_KEY  required for step / intent (calls the real adapter)
//
// Examples:
//   pnpm driver init                    # creates new session
//   pnpm driver step latest "jake"      # opener Q1
//   pnpm driver step latest "1995-10-10"
//   pnpm driver step latest "single"
//   pnpm driver step latest ""           # intent opener: blank
//   pnpm driver step latest "searching"  # first post-opener Q
//   ...
//   pnpm driver intent latest "what should i do about the move?"

import fs from 'node:fs';
import path from 'node:path';
import { AntechamberEngine } from '../src/pipeline/antechamber/engine';
import { AnthropicAdapter } from '../src/pipeline/llm';
import { createClaudeClient } from '../src/pipeline/claude';
import {
  clearAgentEvents,
  getAgentEvents,
  type AgentEvent,
} from '../src/debug/agentActivityBus';
import type { EngineState, RenderedQuestion } from '../src/pipeline/antechamber/types';
import type { LivingDoc, CoverageMap } from '../src/pipeline/antechamber/living-doc';

const SESS_ROOT = path.join(process.cwd(), 'runs', 'driver');

// ─── entrypoint ────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2];
  const sidArg = process.argv[3];
  const tail = process.argv.slice(4).join(' ');

  if (!cmd || cmd === '-h' || cmd === '--help') {
    printUsage();
    process.exit(0);
  }
  try {
    switch (cmd) {
      case 'init':
        await runInit(sidArg);
        break;
      case 'step':
        requireArg(sidArg, 'sid');
        await runStep(resolveSid(sidArg), tail);
        break;
      case 'intent':
        requireArg(sidArg, 'sid');
        await runIntent(resolveSid(sidArg), tail);
        break;
      case 'dump':
        requireArg(sidArg, 'sid');
        await runDump(resolveSid(sidArg));
        break;
      case 'list':
        runList();
        break;
      default:
        console.error(`unknown command: ${cmd}\n`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error('driver crashed:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

// ─── commands ──────────────────────────────────────────────

async function runInit(sidArg?: string): Promise<void> {
  const sid = sidArg && sidArg !== 'auto' ? sidArg : generateSid();
  const dir = sessionDir(sid);
  if (fs.existsSync(dir)) {
    console.error(`session ${sid} already exists at ${dir}`);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });

  // No LLM call for init — we just create a fresh engine and dump the
  // first question. The adapter is needed only for step/intent.
  // Bypass createClaudeClient's key-prefix check by using the dummy
  // adapter pattern: the engine constructor doesn't call the adapter
  // unless cognition fires, which init doesn't trigger.
  const apiKey = process.env.ANTHROPIC_API_KEY?.startsWith('sk-ant-')
    ? process.env.ANTHROPIC_API_KEY
    : 'sk-ant-init-dummy-not-called';
  const adapter = new AnthropicAdapter(createClaudeClient(apiKey));
  const engine = new AntechamberEngine({ adapter, session_id: sid });
  const state = engine.getState();
  const q = engine.getCurrentQuestion();

  saveState(dir, state);
  saveLatestPointer(sid);

  console.log(`session: ${sid}`);
  console.log(`dir:     ${path.relative(process.cwd(), dir)}`);
  console.log('');
  printNextQuestion(q);
  console.log('');
  console.log(`step:    pnpm driver step latest "<your answer>"`);
}

async function runStep(sid: string, answer: string): Promise<void> {
  const dir = sessionDir(sid);
  const state = loadState(dir);
  if (state.closed) {
    console.error(`session ${sid} is closed (${state.close_reason})`);
    process.exit(1);
  }
  if (state.stage === 'awaiting_intention') {
    console.error(`session ${sid} is at the intention stage — use 'intent' instead of 'step'`);
    process.exit(1);
  }

  // Peek at the current question to decide if we need a real key
  // (post-opener picks fire cognition; openers don't).
  const tmpAdapter = makeAdapter();
  const peekEngine = new AntechamberEngine({ adapter: tmpAdapter, session_id: sid, initialState: state });
  const beforeQ = peekEngine.getCurrentQuestion();
  if (!beforeQ) {
    console.error(`no current question — engine stage is ${state.stage}`);
    process.exit(1);
  }
  const isOpener = ['name', 'birthday', 'birth_time', 'relationship', 'intent'].includes(beforeQ.node_id);
  const adapter = isOpener ? tmpAdapter : makeAdapter({ requireRealKey: true });
  const engine = new AntechamberEngine({ adapter, session_id: sid, initialState: state });
  const docVBefore = engine.getState().doc.v;
  const docCovBefore = engine.getState().doc.coverage;

  clearAgentEvents();
  const startedAt = Date.now();
  await engine.submitAnswer(answer);
  await engine.waitForQuiescence(180_000);
  const elapsed = Date.now() - startedAt;

  const newState = engine.getState();
  const events = [...getAgentEvents()];
  const turnIdx = newState.picks_log.length;

  // Persist state + per-turn log.
  saveState(dir, newState);
  fs.writeFileSync(
    path.join(dir, `turn-${String(turnIdx).padStart(3, '0')}.json`),
    JSON.stringify(
      {
        turn_index: turnIdx,
        question_text: beforeQ.text,
        node_id: beforeQ.node_id,
        options_shown: beforeQ.options,
        answer,
        wall_clock_ms: elapsed,
        doc_v_before: docVBefore,
        doc_v_after: newState.doc.v,
        coverage_before: docCovBefore,
        coverage_after: newState.doc.coverage,
        agent_events: events,
        next_question: engine.getCurrentQuestion(),
        stage: newState.stage,
      },
      null,
      2,
    ),
  );
  appendTranscript(dir, turnIdx, beforeQ, answer);

  // Diagnostic to stdout.
  printTurnHeader(turnIdx, beforeQ, answer, elapsed);
  printAgentEvents(events);
  printDocSummary(newState.doc, docVBefore);
  printCoverage(newState.doc.coverage);
  printDowserMoveFromEvents(events);
  console.log('');
  printNextQuestion(engine.getCurrentQuestion(), newState.stage);
}

async function runIntent(sid: string, intention: string): Promise<void> {
  const dir = sessionDir(sid);
  const state = loadState(dir);
  if (state.stage !== 'awaiting_intention') {
    console.error(`session ${sid} is at stage ${state.stage} — intent only valid at 'awaiting_intention'`);
    process.exit(1);
  }
  const adapter = makeAdapter();
  const engine = new AntechamberEngine({ adapter, session_id: sid, initialState: state });

  clearAgentEvents();
  const startedAt = Date.now();
  engine.submitIntention(intention);
  // submitIntention fires augur + seer construction async — wait on
  // the seer.ready promise (if available) or fall back to waitForQuiescence.
  const seer = engine.getSeer();
  if (seer) {
    try {
      await seer.ready;
    } catch (e) {
      console.warn('seer.ready threw:', e);
    }
  }
  await engine.waitForQuiescence(180_000);
  const elapsed = Date.now() - startedAt;

  const newState = engine.getState();
  const events = [...getAgentEvents()];

  saveState(dir, newState);
  fs.writeFileSync(
    path.join(dir, 'intent-log.json'),
    JSON.stringify(
      {
        intention,
        wall_clock_ms: elapsed,
        agent_events: events,
        stage: newState.stage,
        seer_built: engine.getSeer() !== null,
      },
      null,
      2,
    ),
  );

  console.log(`=== INTENT SUBMITTED ===`);
  console.log(`intention: ${intention || '(empty — "i don\'t know")'}`);
  console.log(`wall clock: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`stage now: ${newState.stage}`);
  console.log(`seer built: ${engine.getSeer() !== null}`);
  console.log('');
  printAgentEvents(events);
  console.log('');
  console.log(`dump:    pnpm driver dump latest`);
}

async function runDump(sid: string): Promise<void> {
  const dir = sessionDir(sid);
  const state = loadState(dir);
  console.log(`=== SESSION ${sid} ===`);
  console.log(`stage:   ${state.stage}`);
  console.log(`closed:  ${state.closed} (${state.close_reason ?? 'n/a'})`);
  console.log(`picks:   ${state.picks_log.length}`);
  console.log(`asked:   ${state.asked_node_ids.length}`);
  console.log(`queue:   ${state.queue.length}`);
  console.log(`profile: ${state.profile.name || '(no name yet)'} · ${state.profile.sun_sign ?? 'no sign'} · lp ${state.profile.life_path ?? '?'}`);
  console.log(`intent:  ${state.chosen_intention ?? state.profile.initial_intention ?? '(none)'}`);
  console.log('');
  printDocSummary(state.doc, undefined);
  printCoverage(state.doc.coverage);
  console.log('');
  console.log('CAST:');
  for (const m of state.profile.cast) {
    console.log(`  ${m.label} (${m.likely_role ?? 'unknown'})${m.notes ? ' · ' + m.notes : ''}`);
  }
  console.log('');
  console.log('RECENT PICKS:');
  for (const p of state.picks_log.slice(-8)) {
    const a = typeof p.answer === 'string' ? p.answer : JSON.stringify(p.answer);
    console.log(`  Q[${p.node_id}] "${p.question_text}" → ${a}${p.latency_ms ? ' (' + p.latency_ms + 'ms)' : ''}`);
  }
}

function runList(): void {
  if (!fs.existsSync(SESS_ROOT)) {
    console.log('no driver sessions yet');
    return;
  }
  const ids = fs.readdirSync(SESS_ROOT)
    .filter((f) => f.startsWith('s_'))
    .map((f) => ({ sid: f, mtime: fs.statSync(path.join(SESS_ROOT, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (ids.length === 0) {
    console.log('no driver sessions yet');
    return;
  }
  console.log(`${ids.length} driver session(s):`);
  for (const { sid, mtime } of ids) {
    try {
      const state = loadState(sessionDir(sid));
      console.log(`  ${sid}  picks=${state.picks_log.length}  stage=${state.stage}  ${new Date(mtime).toISOString()}`);
    } catch {
      console.log(`  ${sid}  (unreadable)`);
    }
  }
}

// ─── helpers: state I/O ────────────────────────────────────

function sessionDir(sid: string): string {
  return path.join(SESS_ROOT, sid);
}

function loadState(dir: string): EngineState {
  const file = path.join(dir, 'state.json');
  if (!fs.existsSync(file)) throw new Error(`no state.json at ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as EngineState;
}

function saveState(dir: string, state: EngineState): void {
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
}

function saveLatestPointer(sid: string): void {
  fs.mkdirSync(SESS_ROOT, { recursive: true });
  fs.writeFileSync(path.join(SESS_ROOT, 'latest'), sid);
}

function resolveSid(arg: string): string {
  if (arg === 'latest') {
    const pointer = path.join(SESS_ROOT, 'latest');
    if (!fs.existsSync(pointer)) throw new Error('no "latest" pointer — run init first');
    return fs.readFileSync(pointer, 'utf-8').trim();
  }
  return arg;
}

function generateSid(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function appendTranscript(dir: string, turnIdx: number, q: RenderedQuestion, answer: string): void {
  const file = path.join(dir, 'transcript.md');
  const optionsLine = q.options.length > 0 ? ` [${q.options.join(' | ')}]` : '';
  const line = `Q${turnIdx} (${q.node_id}): ${q.text}${optionsLine}\nA: ${answer}\n\n`;
  fs.appendFileSync(file, line);
}

function requireArg(arg: string | undefined, name: string): void {
  if (!arg) {
    console.error(`missing required arg: ${name}`);
    printUsage();
    process.exit(1);
  }
}

// ─── helpers: adapter ──────────────────────────────────────

function makeAdapter(opts?: { requireRealKey?: boolean }): AnthropicAdapter {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    if (opts?.requireRealKey) {
      console.error('ANTHROPIC_API_KEY env var not set (or invalid prefix). this step needs the real key to call the cognition agents.');
      process.exit(1);
    }
    // Opener steps don't call the adapter — we can stub with a dummy.
    return new AnthropicAdapter(createClaudeClient('sk-ant-step-dummy-not-called'));
  }
  return new AnthropicAdapter(createClaudeClient(apiKey));
}

// ─── helpers: printers ─────────────────────────────────────

function printUsage(): void {
  console.log(`antechamber-driver — headless survey rig with x-ray vision

usage:
  pnpm driver init [sid]
  pnpm driver step <sid|latest> <answer>
  pnpm driver intent <sid|latest> <intention>
  pnpm driver dump <sid|latest>
  pnpm driver list

env:
  ANTHROPIC_API_KEY  required for step / intent

state lives under runs/driver/<sid>/ — state.json + transcript.md + turn-NNN.json.
the "latest" pointer auto-updates on init so subsequent commands can use 'latest' as sid.
`);
}

function printNextQuestion(q: RenderedQuestion | null, stage?: string): void {
  if (!q) {
    if (stage === 'awaiting_intention') {
      console.log('NEXT: awaiting intention — use `intent <sid> "<your intention>"`');
    } else if (stage === 'finalizing') {
      console.log('NEXT: finalizing — wait for cognition to settle, then dump');
    } else {
      console.log('NEXT: (no more questions; stage=' + (stage ?? '?') + ')');
    }
    return;
  }
  console.log(`NEXT QUESTION (node=${q.node_id}, format=${q.format})`);
  console.log(`  q: ${q.text}`);
  if (q.options.length > 0) {
    console.log('  options:');
    for (const o of q.options) console.log(`    - ${o}`);
  }
  if (q.preamble) console.log(`  preamble: ${q.preamble}`);
}

function printTurnHeader(turnIdx: number, q: RenderedQuestion, answer: string, ms: number): void {
  console.log(`=== TURN ${turnIdx}: q="${q.text}" → a="${answer}" (wall ${(ms / 1000).toFixed(1)}s) ===`);
}

function printAgentEvents(events: readonly AgentEvent[]): void {
  if (events.length === 0) {
    console.log('AGENT EVENTS: (none this turn — opener or no cognition fired)');
    return;
  }
  console.log('AGENT EVENTS:');
  for (const e of events) {
    const dur = e.ended_at ? `${((e.ended_at - e.started_at) / 1000).toFixed(1)}s` : 'in flight';
    const status = e.status === 'failed' ? ' FAILED' : '';
    console.log(`  ${e.label.padEnd(22)} [${e.model ?? '?'}]  ${dur}${status}`);
    if (e.error) {
      console.log(`    error: ${e.error}`);
    }
    if (e.response_preview) {
      const preview = e.response_preview.length > 240
        ? e.response_preview.slice(0, 240) + '…'
        : e.response_preview;
      console.log(`    response: ${preview.split('\n').join(' ')}`);
    }
  }
}

function printDocSummary(doc: LivingDoc, vBefore?: number): void {
  const bump = vBefore !== undefined ? ` (was v=${vBefore})` : '';
  console.log(`\nLIVING DOC v=${doc.v}${bump}:`);
  console.log(`  leading_hypothesis: ${doc.scaffold.leading_hypothesis || '(unset)'}`);
  console.log(`  temporal_lean:      ${doc.scaffold.temporal_lean ?? '(unset)'}`);
  console.log(`  fork:               ${doc.scaffold.fork ? `${doc.scaffold.fork.a} / ${doc.scaffold.fork.b}${doc.scaffold.fork.is_stasis ? ' (stasis)' : ''}` : '(unset)'}`);
  const axisKeys = Object.keys(doc.scaffold.axes);
  if (axisKeys.length > 0) {
    console.log(`  axes:`);
    for (const k of axisKeys) {
      const v = doc.scaffold.axes[k] ?? '';
      const preview = v.length > 80 ? v.slice(0, 80) + '…' : v;
      console.log(`    ${k}: (${v.length}c) ${preview}`);
    }
  }
  const castKeys = Object.keys(doc.scaffold.cast_notes);
  if (castKeys.length > 0) {
    console.log(`  cast_notes:`);
    for (const k of castKeys) {
      const v = doc.scaffold.cast_notes[k] ?? '';
      const preview = v.length > 80 ? v.slice(0, 80) + '…' : v;
      console.log(`    ${k}: ${preview}`);
    }
  }
  if (doc.scaffold.tells.length > 0) {
    console.log(`  tells (${doc.scaffold.tells.length}):`);
    for (const t of doc.scaffold.tells.slice(-5)) console.log(`    - ${t}`);
  }
  if (doc.margin.length > 0) {
    console.log(`  margin (last ${Math.min(5, doc.margin.length)} of ${doc.margin.length}):`);
    for (const m of doc.margin.slice(-5)) console.log(`    - ${m}`);
  }
  if (doc.held.length > 0) {
    console.log(`  held probes (${doc.held.length}):`);
    for (const p of doc.held.slice(0, 6)) {
      console.log(`    ${p.id.padEnd(28)} (age ${p.age_in_turns}) ${p.claim}`);
    }
    if (doc.held.length > 6) console.log(`    ... +${doc.held.length - 6} more`);
  }
  if (doc.story.fork) {
    console.log(`  story.fork: ${doc.story.fork.a} / ${doc.story.fork.b}${doc.story.fork.is_stasis ? ' (stasis)' : ''}`);
  }
  if (doc.story.present_pressure) console.log(`  story.present_pressure: ${doc.story.present_pressure}`);
  if (doc.story.past_root) console.log(`  story.past_root: ${doc.story.past_root}`);
}

function printCoverage(cov: CoverageMap): void {
  const keys = Object.keys(cov);
  if (keys.length === 0) {
    console.log('\nCOVERAGE: (empty)');
    return;
  }
  console.log('\nCOVERAGE:');
  for (const k of keys) {
    const d = cov[k]!;
    const bar = '█'.repeat(Math.round(d.confidence * 10)).padEnd(10, '·');
    console.log(`  ${k.padEnd(20)} ${bar} conf=${d.confidence.toFixed(2)} cont=${d.contention.toFixed(2)} gap=${d.gap.toFixed(2)}`);
  }
}

function printDowserMoveFromEvents(events: readonly AgentEvent[]): void {
  // Find the most recent dowser_step event and try to parse the
  // response_preview for next_move + leading_hypothesis.
  const det = [...events].reverse().find((e) => e.label === 'dowser_step' && e.response_preview);
  if (!det || !det.response_preview) return;
  try {
    const parsed = JSON.parse(det.response_preview.endsWith('…') ? det.response_preview.slice(0, det.response_preview.lastIndexOf('}') + 1) : det.response_preview) as unknown;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const move = obj.next_move as Record<string, unknown> | undefined;
      if (move) {
        console.log(`\nDOWSER NEXT_MOVE:`);
        console.log(`  kind: ${String(move.kind)}`);
        if (move.node_id) console.log(`  node_id: ${String(move.node_id)}`);
        if (move.reason) console.log(`  reason: ${String(move.reason)}`);
      }
      const lead = obj.leading_hypothesis;
      if (typeof lead === 'string' && lead.length > 0) {
        console.log(`\nDOWSER LEADING_HYPOTHESIS:`);
        console.log(`  ${lead}`);
      }
    }
  } catch {
    // Best-effort parse; if response_preview is truncated, we lose the
    // structure. The full payload lives in the turn-NNN.json file.
  }
}

void main();
