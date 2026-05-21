// Detective payload builder — Phase 2 stub.
//
// Phase 3 replaces this with `buildDetectivePayload(ctx)` that
// surfaces `doc.scaffold`, `doc.coverage`, the queue lookahead, and
// instructs the detective to emit ONE move (append | revise |
// conclude) — its leading_hypothesis being the adversarial target
// the next question should try to break.
//
// In Phase 2 the agent throws before this is called.

import type { PipelineContext } from '../../types';

export function buildDetectivePayload(_ctx: PipelineContext): unknown {
  throw new Error('not_implemented_v2: buildDetectivePayload replaced in Phase 3 (LivingDoc + coverage_map payload)');
}
