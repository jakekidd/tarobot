// Detective — combined investigator + question-picker, on Opus.
//
// In one call per turn, the detective:
//   - updates investigation (hypotheses, choice draft, contradictions, hooks, posture)
//   - emits queue_edits (engine currently drops them — guarded re-introduction backlog)
//   - writes a private scratchpad (private_thoughts) that the engine
//     keeps and surfaces back on subsequent calls as `detective_log`
//
// Prompt body now lives in materials/prompts/detective.md and is imported
// via Vite ?raw — single source of truth, editable on GitHub, build picks
// it up automatically.

import { z } from 'zod';
import DETECTIVE_SYSTEM_RAW from '../../../../materials/prompts/detective.md?raw';
import { DetectiveOutputSchema } from '../schemas';
import type { ToolDef } from '../../llm/adapter';

export const DETECTIVE_SYSTEM = DETECTIVE_SYSTEM_RAW;

export const DETECTIVE_TOOL: ToolDef = {
  name: 'detective_step',
  description: 'think out loud, update the investigation, and pick the next question from the basket.',
  input_schema: z.toJSONSchema(DetectiveOutputSchema) as Record<string, unknown>,
};
