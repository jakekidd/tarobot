// Stub LLMAdapter for the ensemble — canned, schema-valid outputs for
// every agent, no network. Shared by the headless smoke (asserts loop
// mechanics + the beat grammar) and the e2e runner's --stub mode.

import type { ZodType } from 'zod';
import type {
  FreeformSpec,
  FreeformStreamingSpec,
  InvocationSpec,
  LLMAdapter,
  StreamingInvocationSpec,
} from '../../src/pipeline/llm/adapter';

export class EnsembleStubAdapter implements LLMAdapter {
  private driverQueue: unknown[];
  private driverCalls = 0;
  private conjectorQueue: unknown[];
  private conjectorCalls = 0;

  constructor(driverQueue?: unknown[], conjectorQueue?: unknown[]) {
    this.driverQueue = driverQueue ?? [
      {
        beat: 'tissue',
        accomplish: 'keep the room warm',
        approx_words: 5,
        note: 'stub default',
      },
    ];
    this.conjectorQueue = conjectorQueue ?? [
      {
        prev: 'unplayed',
        guess: 'are you the kind of person who apologizes when someone else bumps into you?',
      },
    ];
  }

  invoke<T>(_spec: InvocationSpec, _schema: ZodType<T>): Promise<T> {
    throw new Error('ensemble uses streaming calls only');
  }

  async invokeStreaming<T>(spec: StreamingInvocationSpec, schema: ZodType<T>): Promise<T> {
    const out = this.byTool(spec.tool.name, spec.user);
    spec.onStart?.();
    spec.onToolInput?.(JSON.stringify(out));
    spec.onEnd?.();
    return schema.parse(out);
  }

  async invokeFreeform(spec: FreeformSpec): Promise<string> {
    return this.freeformFor(spec.label);
  }

  async invokeFreeformStreaming(spec: FreeformStreamingSpec): Promise<string> {
    const text = this.freeformFor(spec.label);
    spec.onStart?.();
    spec.onChunk?.(text);
    spec.onEnd?.();
    return text;
  }

  private byTool(name: string, user: string): unknown {
    switch (name) {
      case 'select_beat':
        return this.driverQueue[Math.min(this.driverCalls++, this.driverQueue.length - 1)];
      case 'speak':
        return {
          too_safe: 'that sounds really hard. you are doing your best.',
          too_far: 'you will quit that job by winter; the cards never lie.',
          spoken: 'mm. you carry it carefully.',
        };
      case 'fill_slots': {
        // echo something legal: QUOTE slots get a real visitor substring
        const fills: Record<string, string> = {};
        const quoteMatch = user.match(/visitor: ([^\n]{8,40})/);
        const quote = (quoteMatch ? quoteMatch[1] : 'fine').trim().slice(0, 30).trim();
        for (const m of user.matchAll(/- (QUOTE_\d+|NOUN_\d+|CLAUSE_\d+|NAME_\d+):/g)) {
          const key = m[1];
          fills[key] = key.startsWith('QUOTE')
            ? quote
            : key.startsWith('NOUN')
              ? 'the job'
              : key.startsWith('CLAUSE')
                ? 'holding it together'
                : 'maya';
        }
        return { fills };
      }
      case 'file_read':
        return {
          expressing: 'disclosing, then retreating behind competence',
          thoughts: ['i should not have said that much'],
          feelings: [
            { emotion: 'guilt', toward: 'the relief', because: 'she laughed after the heavy part' },
          ],
          cue: 'honor',
          coherence: 3,
          frame_stale: false,
        };
      case 'file_profile':
        return {
          updates: [
            { facet: 'family', answer: 'a sister who calls; she answers with fine' },
            { facet: 'work', answer: 'holds the room at work too; fixes quietly' },
          ],
          elevate: [{ facet: 'work', angle: 'the job came up sideways; ask what it used to be' }],
        };
      case 'conject':
        return this.conjectorQueue[
          Math.min(this.conjectorCalls++, this.conjectorQueue.length - 1)
        ];
      default:
        throw new Error(`stub has no answer for tool ${name}`);
    }
  }

  private freeformFor(label?: string): string {
    if (label === 'ensemble_attention') return '# frame v2\n## focus\n- the sister thread, alive';
    if (label === 'e2e_visitor') return 'i mean, it is fine. it is always fine, right?';
    return 'mm.';
  }
}
