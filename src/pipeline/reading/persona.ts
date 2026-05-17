// Persona-tier call wrappers. Each function builds an InvocationSpec and
// routes through adapter.invoke(). The voiced layer.
//
// Tier choices, deliberate:
//   - personaPerCard:  deep   — beat voice is load-bearing
//   - personaIntro:    deep   — first impression, sets the room
//   - personaClosing:  deep   — the line they carry home
//   - personaChat:     cognition — quick, conversational, lower stakes;
//                                  cuts ~50% off chat-reply latency.
// When local OSS LLM swap lands, these are the call sites to repoint.

import type { LLMAdapter } from '../survey/adapter';
import { MonologueSchema } from './schemas';
import {
  PER_CARD_PERSONA_SYSTEM,
  PER_CARD_PERSONA_TOOL,
  INTRO_PERSONA_SYSTEM,
  INTRO_PERSONA_TOOL,
  CLOSING_PERSONA_SYSTEM,
  CLOSING_PERSONA_TOOL,
  CHAT_PERSONA_SYSTEM,
  CHAT_PERSONA_TOOL,
} from './prompts/persona';
import type {
  ChatPersonaInput,
  ClosingPersonaInput,
  IntroPersonaInput,
  Monologue,
  PerCardPersonaInput,
} from './types';

export async function personaPerCard(
  adapter: LLMAdapter,
  input: PerCardPersonaInput,
): Promise<Monologue> {
  const payload = {
    identity: input.profile.identity,
    prose_brief: input.prose_brief,
    set: input.set,
    card: input.card,
    slot_label: input.slot_label,
    revealed_history: input.revealed_history,
    chat_history: input.chat_history,
    instruction:
      'voice ONE beat as the seer. inhabit the Set; perform from it. do not paraphrase or recite its contents.',
  };

  return adapter.invoke<Monologue>(
    {
      system: PER_CARD_PERSONA_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: PER_CARD_PERSONA_TOOL,
      model: 'deep',
      max_tokens: 500,         // beats are 2-4 sentences; cap tighter
    },
    MonologueSchema,
  );
}

export async function personaIntro(
  adapter: LLMAdapter,
  input: IntroPersonaInput,
): Promise<Monologue> {
  const payload = {
    identity: input.profile.identity,
    prose_brief: input.prose_brief,
    instruction:
      'voice ONE short opening line as the seer. land them in the room. do not demonstrate insight yet.',
  };

  return adapter.invoke<Monologue>(
    {
      system: INTRO_PERSONA_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: INTRO_PERSONA_TOOL,
      model: 'deep',
      max_tokens: 200,
    },
    MonologueSchema,
  );
}

export async function personaClosing(
  adapter: LLMAdapter,
  input: ClosingPersonaInput,
): Promise<Monologue> {
  const payload = {
    identity: input.profile.identity,
    prose_brief: input.prose_brief,
    revealed: input.revealed.map((r) => ({
      position_id: r.position_id,
      card_id: r.card_id,
      beat_text: r.monologue.text,
    })),
    chat_history: input.chat_history,
    closing: input.closing,
    instruction: 'voice the outro. one or two sentences. drop the voice.',
  };

  return adapter.invoke<Monologue>(
    {
      system: CLOSING_PERSONA_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: CLOSING_PERSONA_TOOL,
      model: 'deep',
      max_tokens: 300,
    },
    MonologueSchema,
  );
}

export async function personaChat(
  adapter: LLMAdapter,
  input: ChatPersonaInput,
): Promise<Monologue> {
  const payload = {
    identity: input.profile.identity,
    prose_brief: input.prose_brief,
    revealed: input.revealed.map((r) => ({
      position_id: r.position_id,
      card_id: r.card_id,
      beat_text: r.monologue.text,
    })),
    chat_history: input.chat_history,
    user_message: input.user_message,
    instruction: 'respond to the participant as the seer. short.',
  };

  return adapter.invoke<Monologue>(
    {
      system: CHAT_PERSONA_SYSTEM,
      user: JSON.stringify(payload, null, 2),
      tool: CHAT_PERSONA_TOOL,
      model: 'cognition',      // chat replies don't need the full deep tier
      max_tokens: 300,
    },
    MonologueSchema,
  );
}
