// Director-layer prompts for the reading. Three prompts:
//   - PER_CARD: one fan-out thread per still-face-down slot, per round.
//   - CLOSING:  one synthesis pass after all four flips.
//   - INTRO:    the prose brief the seer reads silently before voicing.
//
// The director is the offstage planner / diviner. It prepares a SET —
// Stanislavski "given circumstances" — that the actor will INHABIT. The
// director does NOT write content. It stages the interior state from
// which the seer will perform. The actor is not a translator; the actor
// walks onto a prepared scene.
//
// Prompt bodies now live under materials/prompts/seer/ and are imported
// via Vite ?raw. Schemas + ToolDefs stay here.

import { z } from 'zod';
import PER_CARD_DIRECTOR_SYSTEM_RAW from '../../../../materials/prompts/seer/director-per-card.md?raw';
import CLOSING_DIRECTOR_SYSTEM_RAW from '../../../../materials/prompts/seer/director-closing.md?raw';
import INTRO_DIRECTOR_SYSTEM_RAW from '../../../../materials/prompts/seer/director-intro.md?raw';
import { SetSchema, ClosingIntentSchema } from '../schemas';
import type { ToolDef } from '../../llm/adapter';

// ─── Per-card director (prepares the Set) ─────────────────────

export const PER_CARD_DIRECTOR_SYSTEM = PER_CARD_DIRECTOR_SYSTEM_RAW;

export const PER_CARD_DIRECTOR_TOOL: ToolDef = {
  name: 'prepare_set',
  description:
    'prepare a Set — given circumstances the seer will inhabit when this card flips.',
  input_schema: z.toJSONSchema(SetSchema) as Record<string, unknown>,
};

// ─── Closing director ─────────────────────────────────────────

export const CLOSING_DIRECTOR_SYSTEM = CLOSING_DIRECTOR_SYSTEM_RAW;

export const CLOSING_DIRECTOR_TOOL: ToolDef = {
  name: 'plan_closing',
  description: 'plan the closing takeaway the seer will voice as outro.',
  input_schema: z.toJSONSchema(ClosingIntentSchema) as Record<string, unknown>,
};

// ─── INTRO (replaces survey Compiler's prose_brief) ─────────

export const INTRO_DIRECTOR_SYSTEM = INTRO_DIRECTOR_SYSTEM_RAW;

export const INTRO_DIRECTOR_TOOL: ToolDef = {
  name: 'plan_intro',
  description: 'write the prose brief the seer reads silently before voicing her intro. operational, diviner-tier specificity, 200-400 words.',
  input_schema: {
    type: 'object',
    properties: {
      prose_brief: {
        type: 'string',
        description: 'the brief itself — 200-400 word case file for the seer. third-person, specific.',
      },
      reasoning: {
        type: 'string',
        description: '1-2 sentences on what is load-bearing about this brief. private to engine logs.',
      },
    },
    required: ['prose_brief', 'reasoning'],
  },
};
