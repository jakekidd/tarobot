// Minimal repro for the consent-judge wedge: two probe runs each show
// 5/5 `consent` freeform-streaming calls hung forever (no chunk, no
// resolve, no reject). This isolates invokeFreeformStreaming with the
// exact consent parameters — solo, then racing a concurrent tool
// stream — with hard timeouts so a hang is measurable.
//
//   node --import ./scripts/register-raw-loader.mjs --import tsx scripts/experiments/consent-repro.ts

import { readFileSync } from 'node:fs';
import { createClaudeClient } from '../../src/pipeline/claude';
import { AnthropicAdapter } from '../../src/pipeline/llm/adapter-anthropic';

function key(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const m = readFileSync('.env.local', 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!m) throw new Error('no key');
  return m[1]!.trim();
}

const SYSTEM =
  'a reader asked a visitor for consent to focus on a topic. judge the visitor\'s reply. "yes" = clear assent in any words (agreement, topic-engagement that embraces the frame). "no" = decline, correction, or rejection of the frame — even polite. "ambivalent" = hedged, conditional, or unclear. answer with exactly one word: yes | no | ambivalent.';
const USER =
  "THE OFFER: i think the real thing is carrying the silence after she left. want to go there?\nTHE REPLY: yeah. okay. that's the real thing. go there.";

function timed<T>(label: string, p: Promise<T>, ms: number): Promise<void> {
  const t0 = Date.now();
  return Promise.race([
    p.then(
      (v) => console.log(`${label}: OK in ${Date.now() - t0}ms → ${JSON.stringify(v).slice(0, 80)}`),
      (e) => console.log(`${label}: REJECTED in ${Date.now() - t0}ms → ${e instanceof Error ? e.message : e}`),
    ),
    new Promise<void>((r) =>
      setTimeout(() => {
        console.log(`${label}: HUNG past ${ms}ms`);
        r();
      }, ms),
    ),
  ]);
}

async function main() {
  const adapter = new AnthropicAdapter(createClaudeClient(key()));

  console.log('1) consent-shaped freeform STREAMING, max_tokens=5, fast tier, solo:');
  await timed(
    'solo mt=5',
    adapter.invokeFreeformStreaming({
      system: SYSTEM,
      user: USER,
      model: 'fast',
      max_tokens: 5,
      label: 'repro_consent',
    }),
    20_000,
  );

  console.log('2) same call, max_tokens=64:');
  await timed(
    'solo mt=64',
    adapter.invokeFreeformStreaming({
      system: SYSTEM,
      user: USER,
      model: 'fast',
      max_tokens: 64,
      label: 'repro_consent',
    }),
    20_000,
  );

  console.log('3) mt=5 racing a concurrent cognition tool stream:');
  const bigTool = adapter.invokeStreaming(
    {
      system: 'you narrate one sentence about weather.',
      user: 'file a report.',
      tool: {
        name: 'report',
        description: 'file the report',
        input_schema: {
          type: 'object' as const,
          properties: { text: { type: 'string' as const } },
          required: ['text'],
        },
      },
      model: 'cognition',
      max_tokens: 300,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (await import('zod')).z.object({ text: (await import('zod')).z.string() }) as any,
  );
  await timed(
    'concurrent mt=5',
    adapter.invokeFreeformStreaming({
      system: SYSTEM,
      user: USER,
      model: 'fast',
      max_tokens: 5,
      label: 'repro_consent',
    }),
    20_000,
  );
  await timed('the tool stream itself', bigTool, 30_000);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
