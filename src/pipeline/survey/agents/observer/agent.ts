// Observer — Phase 2 stub.
//
// Phase 3 implements the v2 observer: single sequential writer of
// LivingDoc, delta-on-scaffold output, doc.v staleness gate, hard
// prompt rules against astrology / specifics fabrication.
//
// In Phase 2 these functions throw `not_implemented_v2` when called.
// The engine's runObserverTask catches and logs via console.warn,
// so the survey still proceeds (just without observations) — Q5+ in
// dev will show the warning in the console + the AgentActivity panel.

import type { LLMAdapter } from '../../../llm/adapter';
import type { PipelineContext } from '../../types';
import type { ObserverOutput } from './apply';

export async function runObserver(
  _adapter: LLMAdapter,
  _ctx: PipelineContext,
): Promise<ObserverOutput> {
  throw new Error('not_implemented_v2: runObserver lands in Phase 3 (sequential cognition core)');
}

export async function runFinalObserver(
  _adapter: LLMAdapter,
  _ctx: PipelineContext,
): Promise<ObserverOutput> {
  throw new Error('not_implemented_v2: runFinalObserver lands in Phase 3');
}
