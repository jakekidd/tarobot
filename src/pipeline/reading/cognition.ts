// Cognition-tier call wrappers. Each function builds an InvocationSpec and
// routes through adapter.invoke(). No SDK calls live in here.

import type { LLMAdapter } from '../survey/adapter';
import { ClinicalIntentSchema, ClosingIntentSchema } from './schemas';
import {
  PER_CARD_COGNITION_SYSTEM,
  PER_CARD_COGNITION_TOOL,
  CLOSING_COGNITION_SYSTEM,
  CLOSING_COGNITION_TOOL,
} from './prompts/cognition';
import type {
  ClinicalIntent,
  ClosingCognitionInput,
  ClosingIntent,
  PerCardCognitionInput,
} from './types';

export async function cognitionPerCard(
  adapter: LLMAdapter,
  input: PerCardCognitionInput,
): Promise<ClinicalIntent> {
  const payload = {
    identity: input.profile.identity,
    choice:
      input.profile.candidates.find((c) => c.is_target) ??
      input.profile.candidates[0] ??
      null,
    cast: input.profile.cast,
    hunches: input.profile.hunches,
    margin: input.profile.margin,
    cognition_log: input.profile.cognition_log,
    highlights: input.profile.highlights,
    prose_brief: input.prose_brief,
    spread_id: input.spread_id,
    spread_name: input.spread_name,
    all_positions: input.all_positions,
    this_slot: input.this_slot,
    flip_round: input.flip_round,
    revealed_history: input.revealed_history,
    chat_history: input.chat_history,
    instruction:
      'emit ONE ClinicalIntent for this_slot, voiced for flip_round. you do not know the other face-down cards.',
  };

  return adapter.invoke<ClinicalIntent>(
    {
      system: PER_CARD_COGNITION_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: PER_CARD_COGNITION_TOOL,
      model: 'cognition',
      max_tokens: 1200,
    },
    ClinicalIntentSchema,
  );
}

export async function cognitionClosing(
  adapter: LLMAdapter,
  input: ClosingCognitionInput,
): Promise<ClosingIntent> {
  const payload = {
    identity: input.profile.identity,
    choice:
      input.profile.candidates.find((c) => c.is_target) ??
      input.profile.candidates[0] ??
      null,
    cast: input.profile.cast,
    hunches: input.profile.hunches,
    margin: input.profile.margin,
    prose_brief: input.prose_brief,
    revealed: input.revealed.map((r) => ({
      position_id: r.position_id,
      card_id: r.card_id,
      clinical: r.clinical,
      beat_text: r.monologue.text,
    })),
    chat_history: input.chat_history,
    instruction:
      'emit ONE ClosingIntent — a structural takeaway, not a recap. mirror, not oracle.',
  };

  return adapter.invoke<ClosingIntent>(
    {
      system: CLOSING_COGNITION_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: CLOSING_COGNITION_TOOL,
      model: 'cognition',
      max_tokens: 800,
    },
    ClosingIntentSchema,
  );
}
