#!/usr/bin/env tsx
// E2E survey test. Generates a synthetic participant (Opus) and runs them
// through the live survey engine answering as that persona (Haiku per turn).
// Writes a timestamped run log to runs/.
//
// Usage:
//   pnpm e2e -- --apiKey=sk-ant-...
//   pnpm e2e -- --apiKey=$ANTHROPIC_API_KEY --load jade

import * as path from 'node:path';
import kleur from 'kleur';
import { createClaudeClient } from '../src/pipeline/claude';
import {
  generateArchetype,
  loadArchetype,
  saveArchetype,
  summarizeArchetype,
  type Archetype,
} from './e2e/archetype';
import { runAntechamber } from './e2e/runner';
import { createLogger } from './e2e/log';
import { formatSessionSummary, persistSession } from './e2e/tokens';

// ESM: import.meta.dirname is the node-21+ equivalent of __dirname.
const ROOT = path.resolve(import.meta.dirname, '..');
const ARCHETYPES_DIR = path.join(ROOT, 'archetypes');
const RUNS_DIR = path.join(ROOT, 'runs');
const TOKENS_FILE = path.join(RUNS_DIR, 'tokens.json');

function parseArgs(argv: string[]): { apiKey?: string; load?: string; maxQuestions?: number } {
  const out: { apiKey?: string; load?: string; maxQuestions?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--apiKey=')) out.apiKey = arg.slice('--apiKey='.length);
    else if (arg === '--apiKey') out.apiKey = argv[++i];
    else if (arg.startsWith('--load=')) out.load = arg.slice('--load='.length);
    else if (arg === '--load') out.load = argv[++i];
    else if (arg.startsWith('--maxQuestions=')) out.maxQuestions = Number(arg.slice('--maxQuestions='.length));
    else if (arg === '--maxQuestions') out.maxQuestions = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(kleur.red('e2e: --apiKey or ANTHROPIC_API_KEY required'));
    process.exit(1);
  }

  const client = createClaudeClient(apiKey);

  // Acquire archetype
  let archetype: Archetype;
  if (args.load) {
    archetype = loadArchetype(ARCHETYPES_DIR, args.load);
    console.log(kleur.cyan().dim(`[archetype] loaded ${args.load}`));
  } else {
    console.log(kleur.cyan().dim('[archetype] generating via opus...'));
    archetype = await generateArchetype(client);
    const saved = saveArchetype(archetype, ARCHETYPES_DIR);
    console.log(kleur.cyan().dim(`[archetype] saved to ${path.relative(ROOT, saved)}`));
  }

  const logger = createLogger(RUNS_DIR, archetype.first_name);
  logger.archetypeGenerated(archetype.first_name, summarizeArchetype(archetype));

  const result = await runAntechamber(client, archetype, logger, {
    maxQuestions: args.maxQuestions,
  });

  // Write the markdown run log
  const logFile = logger.writeRunLog(archetype, result.final_state, result.brief);
  console.log(kleur.cyan().bold(`\nRun log written to ${path.relative(ROOT, logFile)}`));

  // Persist token totals so we can see lifetime spend across runs
  persistSession(TOKENS_FILE, archetype.first_name, result.final_state.close_reason ?? null);
  console.log(kleur.cyan().bold('\nTokens this session:'));
  console.log(kleur.gray(formatSessionSummary()));
}

main().catch((err) => {
  console.error(kleur.red().bold('\ne2e: fatal error'));
  console.error(err);
  process.exit(1);
});
