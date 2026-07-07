// Stub LLMAdapter for the ensemble — canned, schema-valid outputs for
// every agent, no network. Shared by the headless smoke (asserts loop
// mechanics) and the e2e runner's --stub mode (validates the runner
// itself before burning a key).

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

  constructor(driverQueue?: unknown[]) {
    this.driverQueue = driverQueue ?? [
      {
        move: 'respond',
        thread: 'the room',
        accomplish: 'keep the room warm',
        approx_words: 15,
        note: 'stub default',
      },
    ];
  }

  invoke<T>(_spec: InvocationSpec, _schema: ZodType<T>): Promise<T> {
    throw new Error('ensemble uses streaming calls only');
  }

  async invokeStreaming<T>(spec: StreamingInvocationSpec, schema: ZodType<T>): Promise<T> {
    const out = this.byTool(spec.tool.name);
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

  private byTool(name: string): unknown {
    switch (name) {
      case 'drive':
        return this.driverQueue[Math.min(this.driverCalls++, this.driverQueue.length - 1)];
      case 'file_read':
        return {
          expressing: 'disclosing, then retreating behind competence',
          thoughts: ['i should not have said that much'],
          feelings: [
            { emotion: 'guilt', toward: 'the relief', because: 'she laughed after the heavy part' },
          ],
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
    if (label === 'e2e_visitor') return 'i mean, it is fine. it is always fine, right?';
    return 'so. you carry it well.';
  }
}
