// Conjector prompts + tool defs. System bodies live in
// materials/prompts/conjector/ (Vite ?raw, so they tune on GitHub without a
// code change); schemas + ToolDefs stay here.

import { z } from 'zod';
import MOVE_SYSTEM_RAW from '../../../../materials/prompts/conjector/move.md?raw';
import REROOT_SYSTEM_RAW from '../../../../materials/prompts/conjector/reroot.md?raw';
import SUMMARY_SYSTEM_RAW from '../../../../materials/prompts/conjector/summary.md?raw';
import type { ToolDef } from '../../llm/adapter';
import { MoveSchema, RerootSchema, SummarySchema } from './schemas';

export const MOVE_SYSTEM = MOVE_SYSTEM_RAW;
export const REROOT_SYSTEM = REROOT_SYSTEM_RAW;
export const SUMMARY_SYSTEM = SUMMARY_SYSTEM_RAW;

export const MOVE_TOOL: ToolDef = {
  name: 'make_move',
  description: 'emit one move: a specific guess, or the committing reframe.',
  input_schema: z.toJSONSchema(MoveSchema) as Record<string, unknown>,
};

export const REROOT_TOOL: ToolDef = {
  name: 'reroot',
  description: 'find a genuinely different live territory, or declare the field exhausted.',
  input_schema: z.toJSONSchema(RerootSchema) as Record<string, unknown>,
};

export const SUMMARY_TOOL: ToolDef = {
  name: 'close_thread',
  description: 'first-person close of the thread for the compiler to deepen.',
  input_schema: z.toJSONSchema(SummarySchema) as Record<string, unknown>,
};
