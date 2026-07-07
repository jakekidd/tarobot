// Headless ensemble smoke — drives EnsembleEngine through a scripted
// chat session against a stub adapter (no API key, no network) and
// asserts the loop's mechanics: open dispatch, stall debt lifecycle,
// fan write-through, prediction judging. Prints the scroll at the end.
//
//   node --import ./scripts/register-raw-loader.mjs --import tsx scripts/ensemble-smoke.ts

import type {
  FreeformSpec,
  FreeformStreamingSpec,
  InvocationSpec,
  LLMAdapter,
  StreamingInvocationSpec,
} from '../src/pipeline/llm/adapter';
import type { ZodType } from 'zod';
import { EnsembleEngine } from '../src/pipeline/ensemble/engine';
import { defaultChatInput, defaultDocs } from '../src/pipeline/ensemble/fixtures';

const driverQueue: unknown[] = [
  { move: 'respond', thread: 'the room', accomplish: 'land her in the room', approx_words: 15, note: 'opening' },
  { move: 'stall', thread: 'the sister', accomplish: 'buy a beat; aim at the sister', approx_words: 10, note: 'heavy line, thin tails — braking' },
  { move: 'press', thread: 'the sister', accomplish: 'name the load she carries for the sister', approx_words: 20, note: 'debt paid' },
];
let driverCalls = 0;

class StubAdapter implements LLMAdapter {
  invoke<T>(_spec: InvocationSpec, _schema: ZodType<T>): Promise<T> {
    throw new Error('ensemble uses streaming calls only');
  }

  async invokeStreaming<T>(spec: StreamingInvocationSpec, schema: ZodType<T>): Promise<T> {
    const out = this.byTool(spec.tool.name);
    spec.onToolInput?.(JSON.stringify(out));
    return schema.parse(out);
  }

  async invokeFreeform(spec: FreeformSpec): Promise<string> {
    return this.freeformFor(spec.label);
  }

  async invokeFreeformStreaming(spec: FreeformStreamingSpec): Promise<string> {
    const text = this.freeformFor(spec.label);
    spec.onChunk?.(text);
    return text;
  }

  private byTool(name: string): unknown {
    switch (name) {
      case 'drive':
        return driverQueue[Math.min(driverCalls++, driverQueue.length - 1)];
      case 'file_read':
        return {
          expressing: 'disclosing, then retreating behind competence',
          thoughts: ['i should not have said that much'],
          feelings: [{ emotion: 'guilt', toward: 'the relief', because: 'she laughed after the heavy part' }],
          cue: 'honor',
          frame_stale: false,
        };
      case 'file_thoughts':
        return { thoughts: [{ thought: 'if i put it down, everything falls.', confidence: 2 }] };
      case 'file_questions':
        return { open: [{ question: 'who does she think pays for her leaving' }], answered: [] };
      case 'file_facts':
        return { facts: [{ kind: 'person', label: 'the sister', note: 'older; load-bearing' }] };
      case 'file_bit':
        return { bit: null };
      case 'file_prediction':
        return { gist: 'she deflects into a joke about the job', confidence: 2 };
      case 'grade':
        return { verdict: 'graze' };
      default:
        throw new Error(`stub has no answer for tool ${name}`);
    }
  }

  private freeformFor(label?: string): string {
    if (label === 'ensemble_attention') return '# frame v2\n## focus\n- the sister thread, alive';
    return 'so. you carry it well.';
  }
}

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
    adapter: new StubAdapter(),
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
