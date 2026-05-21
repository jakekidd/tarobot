// Observer payload builder — Phase 2 stub.
//
// Phase 3 replaces this with `buildObserverPayload(ctx)` that
// surfaces `doc.scaffold` (current state), the latest Q&A, the
// recent N margin entries, computed identity (so the observer
// doesn't fabricate astrology), and the fresh probe seeds.
//
// In Phase 2 the agent throws before this is called.

import type { PipelineContext } from '../../types';

export type ObserverPayloadMode = 'live' | 'final';

export function buildObserverPayload(_ctx: PipelineContext, _mode: ObserverPayloadMode): unknown {
  throw new Error('not_implemented_v2: buildObserverPayload replaced in Phase 3 (LivingDoc-shaped payload)');
}
