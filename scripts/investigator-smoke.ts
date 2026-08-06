// Headless offer-loop smoke — drives the investigator intake
// (COMPOUNDING.md §5) through a scripted happy path against the stub:
// rant → talk turns (conjector hunts beside) → candidate + warm →
// the OFFER → visitor yes → reflection → deal → flips → naming →
// close. Asserts the deletion (no profile during intake), the offer,
// the ratified commit, and the shared card phase.
//
//   node --import ./scripts/register-raw-loader.mjs --import tsx scripts/investigator-smoke.ts

import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultSessionInput } from '../src/pipeline/ensemble/fixtures';
import { EnsembleStubAdapter } from './e2e/ensemble-stub';

const driverQueue: unknown[] = [
  // post-deal only — intake never consults the driver
  { beat: 'read', accomplish: 'read position one', approx_words: 30, note: 'inv-smoke read 1' },
  { beat: 'tissue', accomplish: 'hold the landing', approx_words: 5, note: 'inv-smoke tissue' },
  { beat: 'read', accomplish: 'read position two', approx_words: 30, note: 'inv-smoke read 2' },
  { beat: 'naming', accomplish: 'the ritual', approx_words: 0, note: 'inv-smoke naming' },
  { beat: 'close', accomplish: 'quest + close', approx_words: 0, note: 'inv-smoke close' },
];

const conjectorQueue: unknown[] = [
  { prev: 'unplayed', guess: 'are you the kind of person who fixes it quietly and calls it fine?' },
  {
    prev: 'warm',
    class: 'WEIGHT',
    focus: 'the thing you carry alone',
    problem_md: 'you keep the family running and call it fine. nobody sees you pick it up.',
    options_md:
      'keep carrying as-is. or set part of it down and find out what falls. or ask someone to see it.',
  },
  {
    class: 'WEIGHT',
    problem_md:
      'reflection: you hold the family and call it fine — and the tired has stopped being about the work.',
    options_md:
      'reflection: keep the invisibility, set one piece down and see what actually falls, or let one person watch you pick it up.',
  },
  {
    prev: 'hot',
    quest_md:
      'next time someone asks how you are, count one beat before you say fine. just the noticing.',
  },
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
  if (!cond) throw new Error(`INVESTIGATOR SMOKE FAIL: ${msg}`);
  console.log(`  ok — ${msg}`);
}

async function main() {
  const engine = new EnsembleEngine({
    adapter: new EnsembleStubAdapter(driverQueue, conjectorQueue),
    input: defaultSessionInput('investigator'),
  });

  const beatTypes = () =>
    engine
      .snapshot()
      .scroll.filter((e) => e.kind === 'beat' && e.speaker === 'oracle')
      .map((e) => (e.kind === 'beat' ? (e.beatType ?? '') : ''));

  console.log('boot:');
  engine.start();
  await settle(engine);
  assert(beatTypes().length === 2, 'greeting + rant bid before the visitor');

  console.log('the rant — one investigator call, the conjector wakes, NO fan:');
  engine.visitorLine(
    'okay so my sister called last night and i said i was fine which is what we say, and honestly i have been holding the whole family since dad died, and work is the same show different stage',
  );
  await settle(engine);
  let s = engine.snapshot();
  assert(beatTypes().includes('talk'), 'the investigator spoke a talk beat');
  assert(s.profile.length === 0, 'the deletion: no profile facets during intake');
  assert(s.pendingGuess !== null, 'the conjector filed a guess off the rant');
  assert(!beatTypes().includes('question'), 'no driver question beats in intake');

  console.log('two more turns — the probe hands over, the candidate lands:');
  engine.visitorLine("under it? i don't know. someone has to hold it. i handle things quietly.");
  await settle(engine);
  engine.visitorLine('yeah. that is exactly it. quietly, every time. fix it and say nothing.');
  await settle(engine);
  s = engine.snapshot();
  assert(beatTypes().includes('focus'), 'the OFFER was made (candidate + warm → shortcut)');
  assert(s.drawn.length === 0, 'no cards before the yes');

  console.log('the yes — ratified commit: reflection, then the deal:');
  engine.visitorLine('yes. that is the thing. go.');
  await settle(engine);
  s = engine.snapshot();
  assert(s.drawn.length === 4, `WEIGHT spread dealt on the yes (got ${s.drawn.length})`);
  assert(
    Boolean(s.dilemma.problem_md?.includes('reflection')),
    'the reflection pass rewrote the document from the record',
  );
  assert(s.profile.length === 0, 'still no profile — intake ended without a fan cycle');

  console.log('the card phase — shared ensemble machinery:');
  engine.flip(1);
  await settle(engine);
  engine.visitorLine('huh. okay. that is close to home.');
  await settle(engine);
  engine.flip(2);
  await settle(engine);
  engine.visitorLine('yeah. keep going.');
  await settle(engine);
  s = engine.snapshot();
  assert(s.namingDelivered, 'the naming fired after 2 flips + committed doc');

  engine.visitorLine('okay. yes. that lands. thank you.');
  await settle(engine);
  s = engine.snapshot();
  assert(s.phase === 'closed', 'session closed');
  const types = beatTypes();
  assert(types[types.length - 1] === 'close', 'last beat is the close');
  assert(types[types.length - 2] === 'quest', 'quest handed over before the close');

  console.log('\nthe scroll:');
  for (const e of s.scroll) {
    if (e.kind === 'beat')
      console.log(
        `  ${e.speaker}${e.beatType ? ` [${e.beatType}]` : ''}: ${e.text.split('\n')[0].slice(0, 90)}`,
      );
  }
  console.log('\ninvestigator smoke passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
