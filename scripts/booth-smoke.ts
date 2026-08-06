#!/usr/bin/env tsx
// Booth presentation smoke — drives BoothStage (the 3d demo's pure
// state) through a full stub session: deal-by-clicking, flip gating,
// subtitle sequencing. No DOM, no three.js, no key.
import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultSessionInput } from '../src/pipeline/ensemble/fixtures';
import { BoothStage } from '../src/ui/booth/boothStage';
import { EnsembleStubAdapter } from './e2e/ensemble-stub';

const driverQueue: unknown[] = [
  { beat: 'question', frame: 'THREAD', accomplish: 'q', approx_words: 12, note: 's' },
  { beat: 'deal', accomplish: 'deal', approx_words: 30, note: 's' },
  { beat: 'read', accomplish: 'read', approx_words: 30, note: 's' },
  { beat: 'read', accomplish: 'read', approx_words: 30, note: 's' },
  { beat: 'naming', accomplish: 'ritual', approx_words: 0, note: 's' },
  { beat: 'close', accomplish: 'end', approx_words: 0, note: 's' },
];
const conjectorQueue: unknown[] = [
  {
    prev: 'unplayed',
    class: 'WEIGHT',
    problem_md: 'you carry it and call it fine.',
    options_md: 'keep carrying, or set part down.',
  },
  { quest_md: 'next time someone asks how you are, wait one beat. notice what almost comes out.' },
];

function settle(engine: EnsembleEngine): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => {
      const s = engine.snapshot();
      if (s.busy === null && !s.fanInFlight && !s.attentionInFlight) return resolve();
      if (Date.now() - t0 > 5000) return reject(new Error('no settle'));
      setTimeout(poll, 10);
    };
    poll();
  });
}
function assert(c: boolean, m: string): void {
  if (!c) throw new Error(`BOOTH SMOKE FAIL: ${m}`);
  console.log(`  ok — ${m}`);
}

async function main() {
  const engine = new EnsembleEngine({
    adapter: new EnsembleStubAdapter(driverQueue, conjectorQueue),
    input: defaultSessionInput(),
  });
  const stage = new BoothStage(engine);

  engine.start();
  await settle(engine);
  let v = stage.view();
  assert(
    v.subtitle !== null && v.subtitle.includes('quiet table') && v.subtitle.includes('before any cards'),
    'boot subtitle carries greeting AND rant bid together',
  );
  assert(v.cards.length === 0, 'no cards before the deal (the deck itself always rests on the table)');
  assert(v.awaiting === 'visitor', 'awaiting the visitor');

  engine.visitorLine('okay so honestly i have been holding the whole family since dad died and nobody asks');
  await settle(engine);
  engine.visitorLine('yeah. someone has to. show me the cards.');
  await settle(engine);
  v = stage.view();
  assert(v.awaiting === 'deal', 'deck becomes dealable after the engine deals');
  assert(v.cards.length === 4 && v.cards.every((c) => !c.dealt), '4 cards drawn, none visually dealt');

  stage.clickCard(1);
  assert(engine.snapshot().flipped.length === 0, 'flip refused before dealing finishes');
  for (let i = 0; i < 4; i++) stage.clickDeck();
  v = stage.view();
  assert(v.cards.every((c) => c.dealt) && v.awaiting !== 'deal', 'four deck clicks deal all cards');

  stage.clickCard(2);
  await settle(engine);
  v = stage.view();
  assert(engine.snapshot().flipped.includes(2), 'clicking a dealt card flips it');
  assert(v.cards.find((c) => c.slot === 2)?.name !== null, 'flipped card shows its name');
  const seqAfterRead = v.subtitleSeq;

  stage.clickCard(3);
  await settle(engine);
  engine.visitorLine('huh. okay. keep going.');
  await settle(engine);
  v = stage.view();
  assert(v.subtitleSeq > seqAfterRead, 'subtitle seq advances with new oracle beats');
  assert(engine.snapshot().namingDelivered, 'naming fired through the booth path');

  engine.visitorLine('yes. that lands. thank you.');
  await settle(engine);
  v = stage.view();
  assert(v.phase === 'closed' && v.awaiting === 'done', 'session closes; booth shows done');
  assert(
    v.subtitle !== null && v.subtitle.includes('homework') && v.subtitle.includes('reading'),
    'closing subtitle carries quest AND close together',
  );

  console.log('\nbooth smoke passed.');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
