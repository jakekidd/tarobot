// Headless ensemble smoke — drives EnsembleEngine through a scripted
// chat session against a stub adapter (no API key, no network) and
// asserts the loop's mechanics: open dispatch, stall debt lifecycle,
// fan write-through, prediction judging. Prints the scroll at the end.
//
//   node --import ./scripts/register-raw-loader.mjs --import tsx scripts/ensemble-smoke.ts

import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultChatInput, defaultDocs } from '../src/pipeline/ensemble/fixtures';
import { EnsembleStubAdapter } from './e2e/ensemble-stub';

const driverQueue: unknown[] = [
  { move: 'respond', thread: 'the room', accomplish: 'land her in the room', approx_words: 15, note: 'opening' },
  { move: 'stall', thread: 'the sister', accomplish: 'buy a beat; aim at the sister', approx_words: 10, note: 'heavy line, thin tails — braking' },
  { move: 'press', thread: 'the sister', accomplish: 'name the load she carries for the sister', approx_words: 20, note: 'debt paid' },
];

function settle(engine: EnsembleEngine): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const s = engine.snapshot();
      if (s.busy === null && !s.fanInFlight && !s.attentionInFlight) return resolve();
      if (Date.now() - started > 5000) return reject(new Error('engine did not settle'));
      setTimeout(poll, 10);
    };
    poll();
  });
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
  console.log(`  ok — ${msg}`);
}

async function main() {
  const engine = new EnsembleEngine({
    adapter: new EnsembleStubAdapter(driverQueue),
    input: defaultChatInput(defaultDocs()),
  });

  console.log('open:');
  engine.start();
  await settle(engine);
  let s = engine.snapshot();
  assert(s.scroll.some((e) => e.kind === 'beat' && e.speaker === 'seer'), 'opening line committed');
  assert(s.stallDebt === null, 'no stall debt at open');

  console.log('heavy line -> driver stalls:');
  engine.visitorLine(
    'my sister called last night and i told her i was fine but honestly i have been carrying this whole family since dad died',
  );
  await settle(engine);
  s = engine.snapshot();
  assert(s.lastIntent?.move === 'stall', 'driver chose stall');
  assert(s.stallDebt !== null, 'stall debt recorded');
  assert(s.stallDebt!.kind !== undefined, `engine picked stall kind: ${s.stallDebt!.kind}`);
  assert(s.piles.reads.length > 0, 'fan force-fired: read filed');
  assert(s.piles.thoughts.length > 0, 'psychic filed');
  assert(s.piles.facts.length > 0, 'ledger has the sister');
  assert(s.piles.predictions.length > 0, 'cassandra predicted');

  console.log('next line -> debt paid:');
  engine.visitorLine('i mean someone has to hold it together and my mom certainly is not going to be the one');
  await settle(engine);
  s = engine.snapshot();
  assert(s.lastIntent?.move === 'press', 'driver pressed');
  assert(s.stallDebt === null, 'stall debt cleared on non-stall commit');
  const judged = s.piles.predictions.some((p) => p.payload.verdict === 'graze');
  assert(judged, 'pending prediction judged against the new line');

  console.log('\nthe scroll:');
  for (const e of s.scroll) {
    if (e.kind === 'beat') console.log(`  ${e.speaker}: ${e.text}`);
    else console.log(`  <${e.ev}>`);
  }
  console.log('\nsmoke passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
