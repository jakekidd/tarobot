// Augur — survey-side outcome predictor. Replaces the old Compiler.
// Two stages, hidden behind a single runAugur() call:
//
//   1. OUTLINE (sonnet, JSON output via tool) — looks at the intention
//      and decides the shape: binary, ternary, open. Names each outcome.
//      No prose, just { id, label }[]. Fast, cheap.
//
//   2. FILL (opus deep, prose output, N parallel) — for each outline
//      entry, write a freely-formatted markdown document. Texture,
//      specifics, no schema constraint. Per the .txt-team / Castillo
//      research: keep JSON only where it's load-bearing (id/label go
//      into the engine), keep prose where the next consumer is an LLM
//      (the document body is read by Seer's cognition).
//
// Prompt bodies now live in materials/prompts/augur-outline.md and
// materials/prompts/augur-fill.md and are imported via Vite ?raw.

import { z } from 'zod';
import AUGUR_OUTLINE_SYSTEM_RAW from '../../../../materials/prompts/augur-outline.md?raw';
import AUGUR_FILL_SYSTEM_RAW from '../../../../materials/prompts/augur-fill.md?raw';
import type { ToolDef } from '../../llm/adapter';

// ─── Stage 1: outline ───────────────────────────────────

export const AUGUR_OUTLINE_SCHEMA = z.object({
  outcomes: z.array(z.object({
    id: z.string(),
    label: z.string(),
  })).min(2).max(4),
  reasoning: z.string(),
});

export const AUGUR_OUTLINE_SYSTEM = AUGUR_OUTLINE_SYSTEM_RAW;

export const AUGUR_OUTLINE_TOOL: ToolDef = {
  name: 'augur_outline',
  description: 'name the outcomes a person\'s intention question opens onto. 2-4 outcomes, each with a stable id and a short label.',
  input_schema: z.toJSONSchema(AUGUR_OUTLINE_SCHEMA) as Record<string, unknown>,
};

// ─── Stage 2: fill ──────────────────────────────────────

export const AUGUR_FILL_SYSTEM = AUGUR_FILL_SYSTEM_RAW;
