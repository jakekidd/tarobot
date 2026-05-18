// Cognition-tier call wrappers. Each function builds an InvocationSpec and
// routes through adapter.invoke(). No SDK calls live in here.

import { z } from 'zod';
import type { LLMAdapter } from '../survey/adapter';
import { SetSchema, ClosingIntentSchema } from './schemas';
import {
  PER_CARD_COGNITION_SYSTEM,
  PER_CARD_COGNITION_TOOL,
  CLOSING_COGNITION_SYSTEM,
  CLOSING_COGNITION_TOOL,
  INTRO_COGNITION_SYSTEM,
  INTRO_COGNITION_TOOL,
} from './prompts/cognition';
import type {
  Set,
  ClosingCognitionInput,
  ClosingIntent,
  IntroCognitionInput,
  PerCardCognitionInput,
} from './types';

export async function cognitionPerCard(
  adapter: LLMAdapter,
  input: PerCardCognitionInput,
): Promise<Set> {
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
    // Augur-seeded outcomes — pick the one this card sharpens and
    // surface a specific from it into the Set the persona will voice.
    outcomes: input.outcomes.map((o) => ({ id: o.id, label: o.label, document: o.document })),
    spread_id: input.spread_id,
    spread_name: input.spread_name,
    all_positions: input.all_positions,
    this_slot: input.this_slot,
    flip_round: input.flip_round,
    revealed_history: input.revealed_history,
    chat_history: input.chat_history,
    instruction:
      'prepare ONE Set for this_slot. pick WHICH outcome this card most sharpens — embed at least one specific from that outcome (a name, a scene, a friction) into the Set. you do not know the other face-down cards.',
  };

  return adapter.invoke<Set>(
    {
      system: PER_CARD_COGNITION_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: PER_CARD_COGNITION_TOOL,
      model: 'cognition',
      max_tokens: 700,        // Set is shorter than the old clinical doc
    },
    SetSchema,
  );
}

/** Intro cognition — writes the prose brief the seer reads silently
 *  before voicing the intro. Output is reused by all subsequent
 *  per-card + closing cognition calls (stored on state.inputs.prose_brief). */
export async function cognitionIntro(
  adapter: LLMAdapter,
  input: IntroCognitionInput,
): Promise<string> {
  const payload = {
    identity: input.profile.identity,
    cast: input.profile.cast,
    hunches: input.profile.hunches,
    margin: input.profile.margin,
    highlights: input.profile.highlights,
    intention: input.intention,
    survey_history: input.surveyHistory.map((p) => ({
      question: p.question_text,
      options: p.options_shown,
      answer: p.answer,
    })),
    // Augur outcomes — the brief should orient the seer to what's
    // ACROSS them (which one she's noticing first, what's at stake in
    // the user picking either). She does not pitch an outcome.
    outcomes: input.outcomes.map((o) => ({ id: o.id, label: o.label, document: o.document })),
    instruction:
      'write the prose brief the seer reads silently before voicing the intro. detective-tier specificity, 200-400 words, third person, the INTENTION is the centerpiece. orient the seer ACROSS the outcomes — what is at stake either way — without advocating for one.',
  };

  const out = await adapter.invoke<{ prose_brief: string; reasoning: string }>(
    {
      system: INTRO_COGNITION_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: INTRO_COGNITION_TOOL,
      model: 'cognition',
      max_tokens: 1200,
    },
    z.object({ prose_brief: z.string(), reasoning: z.string() }),
  );
  return out.prose_brief;
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
    outcomes: input.outcomes.map((o) => ({ id: o.id, label: o.label, document: o.document })),
    revealed: input.revealed.map((r) => ({
      position_id: r.position_id,
      card_id: r.card_id,
      set: r.set,
      beat_text: r.monologue.text,
    })),
    chat_history: input.chat_history,
    instruction:
      'emit ONE ClosingIntent — a structural takeaway, not a recap. mirror, not oracle. you may name an outcome by its label if a beat sharpened it; you may not pick one.',
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
