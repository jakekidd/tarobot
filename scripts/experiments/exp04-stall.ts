#!/usr/bin/env tsx
// exp04 — stall stress: starve the fan (thresholds set unreachable) so
// the driver faces heavy material with permanently thin tails. does it
// ever reach for the brake? (control condition: seven recorded normal
// runs, zero stalls.) the stall's own force-fire still works, so one
// stall would refill cognition — exactly the designed escape valve.
//
//   node --import ./scripts/register-raw-loader.mjs --import tsx scripts/experiments/exp04-stall.ts --apiKey=...

import { createClaudeClient } from '../../src/pipeline/claude';
import { AnthropicAdapter } from '../../src/pipeline/llm/adapter-anthropic';
import { EnsembleEngine } from '../../src/pipeline/ensemble/engine';
import { defaultChatInput, defaultDocs } from '../../src/pipeline/ensemble/fixtures';
import { MAYA_TRACK, resolveKey, until } from './lib';

async function main() {
  const key = resolveKey(process.argv.slice(2));
  if (!key) {
    console.error('no api key');
    process.exit(1);
  }
  const engine = new EnsembleEngine({
    adapter: new AnthropicAdapter(createClaudeClient(key)),
    input: defaultChatInput(defaultDocs().slice(0, 1)),
    constants: { FAN_MIN_NEW_WORDS: 99999, FAN_BACKSTOP_TURNS: 99999 },
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
    else if (step.silence) engine.silenceTick();
    else continue; // chat mode: no flips
    await until(settled, 180_000);
  }
  const s = engine.snapshot();
  const moves = s.piles.intents.map((i) => i.payload.move);
  console.log('moves:', moves.join(' → '));
  console.log('stalls:', moves.filter((m) => m === 'stall').length);
  console.log('reads pile size (only stall-fired fans write it):', s.piles.reads.length);
  for (const e of s.scroll) {
    if (e.kind === 'beat') console.log(`${e.speaker}: ${e.text.replace(/\n+/g, ' / ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
