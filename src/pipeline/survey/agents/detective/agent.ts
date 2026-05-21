// Detective — Phase 2 stub.
//
// Phase 3 implements the v2 detective: prose-shell output with
// leading_hypothesis + next_move (append | revise | conclude),
// dropping from Opus → Sonnet, adversarial objective (propose the
// question whose answer would most break its own leading read).
//
// In Phase 2 this throws `not_implemented_v2` when called. The
// engine's runDetectiveTask catches and logs.

import type { LLMAdapter } from '../../../llm/adapter';
import type { PipelineContext } from '../../types';
import type { DetectiveOutput } from './apply';

export async function runDetective(
  _adapter: LLMAdapter,
  _ctx: PipelineContext,
): Promise<DetectiveOutput> {
  throw new Error('not_implemented_v2: runDetective lands in Phase 3 (sequential cognition core)');
}
