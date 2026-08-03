// Headless ensemble smoke — drives EnsembleEngine through a scripted
// v2 session against a stub adapter (no API key, no network), asserts
// the beat grammar's mechanics, then runs the S1 gate: mechanical
// checks 1, 4, 5, 9 (plus the full sweep, reported).
//
//   node --import ./scripts/register-raw-loader.mjs --import tsx scripts/ensemble-smoke.ts

import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultSessionInput } from '../src/pipeline/ensemble/fixtures';
import { serializeSession } from '../src/pipeline/ensemble/serialize';
import { checkSession } from './check-session';
import { EnsembleStubAdapter } from './e2e/ensemble-stub';

// the driver's beat selections, in order of dispatch
const driverQueue: unknown[] = [
  // rant answer arrives → a THREAD question
  { beat: 'question', frame: 'THREAD', target: 'the sister', accomplish: 'stay on the heavy part', approx_words: 12, note: 'smoke q1' },
  // second visitor line → tissue (law 4: no stacked questions)
  { beat: 'tissue', accomplish: 'ack', approx_words: 4, note: 'smoke tissue' },
  // third → second question (KIND)
  { beat: 'question', frame: 'KIND', target: 'work', accomplish: 'probe the pattern', approx_words: 14, note: 'smoke q2' },
  // class lands via conjector → deal
  { beat: 'deal', accomplish: 'end intake, explain positions', approx_words: 30, note: 'smoke deal' },
  // flip 1 → read (mandated anyway)
  { beat: 'read', accomplish: 'read position against her', approx_words: 30, note: 'smoke read 1' },
  // visitor reacts → tissue
  { beat: 'tissue', accomplish: 'hold', approx_words: 3, note: 'smoke tissue 2' },
  // flip 2 → read
  { beat: 'read', accomplish: 'read position two', approx_words: 30, note: 'smoke read 2' },
  // naming is now ready (committed + 2 flips) → pick it
  { beat: 'naming', accomplish: 'the ritual', approx_words: 0, note: 'smoke naming' },
  // visitor confirms → close
  { beat: 'close', accomplish: 'quest + close', approx_words: 0, note: 'smoke close' },
];

const conjectorQueue: unknown[] = [
  { prev: 'unplayed', guess: 'are you the kind of person who fixes it quietly and calls it fine?' },
  {
    prev: 'hot',
    class: 'WEIGHT',
    problem_md:
      'you keep the family running and call it fine. the cost is that nobody sees you pick it up, and the tired has stopped being about the work.',
    options_md:
      'keep carrying it as-is and keep the invisibility. or set part of it down and find out what actually falls. the third one you pretend is not there: ask someone to see it.',
  },
  {
    quest_md:
      'next time someone asks how you are, count one beat before you say fine, and notice what almost came out instead. just the noticing.',
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
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
  console.log(`  ok — ${msg}`);
}

async function main() {
  const engine = new EnsembleEngine({
    adapter: new EnsembleStubAdapter(driverQueue, conjectorQueue),
    input: defaultSessionInput(),
  });

  console.log('boot — the authored open:');
  engine.start();
  await settle(engine);
  let s = engine.snapshot();
  const oracleBeats = () =>
    engine.snapshot().scroll.filter((e) => e.kind === 'beat' && e.speaker === 'oracle');
  assert(oracleBeats().length === 2, 'exactly two beats before the visitor (greeting + rant bid)');
  assert(s.drawn.length === 0, 'no cards on the table at boot');
  assert(s.stage === 'intro', `stage is intro (got ${s.stage})`);

  console.log('the rant:');
  engine.visitorLine(
    'okay so my sister called last night and i said i was fine which is what we say, and honestly i have been holding the whole family since dad died, and work is the same show different stage',
  );
  await settle(engine);
  s = engine.snapshot();
  assert(s.lastIntent?.beat === 'question', 'driver asked a question after the rant');
  assert(s.profile.length > 0, 'profiler filled facets off the rant');
  assert(s.pendingGuess !== null, 'conjector woke on the rant and filed a guess');

  console.log('two more turns → class commits:');
  engine.visitorLine('under it? i don\'t know. someone has to hold it.');
  await settle(engine);
  engine.visitorLine('yeah. that is exactly what i do. at work too. fix it quietly, say it\'s fine.');
  await settle(engine);
  s = engine.snapshot();
  assert(s.dilemmaClass === 'WEIGHT', `conjector classified (got ${s.dilemmaClass})`);
  assert(Boolean(s.dilemma.problem_md && s.dilemma.options_md), 'dilemma document committed');

  console.log('the deal:');
  engine.visitorLine('okay. show me the cards then.');
  await settle(engine);
  s = engine.snapshot();
  assert(s.drawn.length === 4, `WEIGHT spread dealt 4 cards (got ${s.drawn.length})`);
  assert(s.scroll.some((e) => e.kind === 'ev' && e.ev === 'deal'), 'deal event recorded');
  assert(s.drawn.every((d) => d.position.length > 0), 'every card carries its position job');

  console.log('flips, the naming, the close:');
  engine.flip(1);
  await settle(engine);
  engine.visitorLine('huh. okay. that is a little close to home.');
  await settle(engine);
  engine.flip(2);
  await settle(engine);
  s = engine.snapshot();
  assert(
    s.piles.intents.some((i) => i.payload.beat === 'read' && i.payload.position),
    'read intents carry position tags',
  );
  engine.visitorLine('yeah. keep going.');
  await settle(engine);
  s = engine.snapshot();
  assert(s.namingDelivered, 'the naming ritual fired after 2 flips + commit');
  const naming = s.scroll.find(
    (e) => e.kind === 'beat' && e.speaker === 'oracle' && e.beatType === 'naming',
  );
  assert(
    naming?.kind === 'beat' && naming.text.startsWith('the cards tell me'),
    'naming opens with the incantation',
  );
  assert(
    naming?.kind === 'beat' && naming.text.includes("i don't pick"),
    'naming ends with the release line',
  );

  engine.visitorLine('okay. yes. that lands. thank you.');
  await settle(engine);
  s = engine.snapshot();
  assert(s.phase === 'closed', 'session closed');
  const types = s.scroll
    .filter((e) => e.kind === 'beat' && e.speaker === 'oracle')
    .map((e) => (e.kind === 'beat' ? e.beatType : ''));
  assert(types[types.length - 1] === 'close', 'last beat is the authored close');
  assert(types[types.length - 2] === 'quest', 'quest handed over before the close');

  console.log('\nthe scroll:');
  for (const e of s.scroll) {
    if (e.kind === 'beat') console.log(`  ${e.speaker}${e.beatType ? ` [${e.beatType}]` : ''}: ${e.text.split('\n')[0].slice(0, 90)}`);
    else console.log(`  <${e.ev}${e.slot !== undefined ? ` ${e.slot}` : ''}>`);
  }

  // ---- the S1 gate: mechanical checks
  const record = serializeSession(engine.input, s, []);
  console.log('\nS1 gate (checks 1, 4, 5, 9):');
  const gate = checkSession(record, [1, 4, 5, 9]);
  for (const r of gate) console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name} — ${r.detail}`);
  if (gate.some((r) => !r.pass)) throw new Error('S1 GATE FAILED');

  console.log('\nfull sweep (informational):');
  for (const r of checkSession(record)) {
    console.log(`  ${r.pass ? 'PASS' : 'fail'} ${String(r.id).padStart(2)} ${r.name} — ${r.detail}`);
  }

  console.log('\nsmoke passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
