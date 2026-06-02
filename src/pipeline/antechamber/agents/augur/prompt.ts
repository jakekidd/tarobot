// Augur prompts, tool, and outline schema. Two stages — outline
// (cognition, JSON tool) and fill (deep, freeform prose). Both
// prompt bodies live in materials/prompts/augur-*.md (Vite ?raw).
//
// Outline + Fill are tightly coupled, so the schema and the prompt
// constants live in the same file rather than splitting across
// schema.ts/prompt.ts. Augur's structure differs from observer +
// diviner enough that the per-agent layout is intentionally lighter.

import { z } from 'zod';
import AUGUR_OUTLINE_SYSTEM_RAW from '../../../../../materials/prompts/augur-outline.md?raw';
import AUGUR_FILL_SYSTEM_RAW from '../../../../../materials/prompts/augur-fill.md?raw';
import type { ToolDef } from '../../../llm/adapter';

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
