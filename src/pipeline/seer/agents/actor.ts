// Actor-layer call wrappers. Each function builds an InvocationSpec and
// routes through adapter.invoke(). The voiced layer — the actor is the
// onstage seer; the director's Set is what the actor walks into.
//
// Tier choices, deliberate:
//   - actorPerCard:  deep   — beat voice is load-bearing
//   - actorIntro:    deep   — first impression, sets the room
//   - actorClosing:  deep   — the line they carry home
//   - actorChat:     cognition — quick, conversational, lower stakes;
//                                cuts ~50% off chat-reply latency.
// When local OSS LLM swap lands, these are the call sites to repoint.

import type { LLMAdapter } from '../../llm/adapter';
import type { Actor } from '../actors';
import { MonologueSchema } from '../schemas';
import { sanitizeMonologue as sanitize } from '../sanitize';
import {
  buildPerCardActorSystem,
  PER_CARD_ACTOR_TOOL,
  buildIntroActorSystem,
  INTRO_ACTOR_TOOL,
  buildClosingActorSystem,
  CLOSING_ACTOR_TOOL,
  buildChatActorSystem,
  CHAT_ACTOR_TOOL,
} from '../prompts/actor';
import type {
  ChatActorInput,
  ClosingActorInput,
  IntroActorInput,
  Monologue,
  PerCardActorInput,
} from '../types';


export async function actorPerCard(
  adapter: LLMAdapter,
  actor: Actor,
  input: PerCardActorInput,
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

  return sanitize(await adapter.invoke<Monologue>(
    {
      system: buildPerCardActorSystem(actor),
      user: JSON.stringify(payload, null, 2),
      tool: PER_CARD_ACTOR_TOOL,
      model: 'deep',
      max_tokens: 500,
    },
    MonologueSchema,
  ));
}

export async function actorIntro(
  adapter: LLMAdapter,
  actor: Actor,
  input: IntroActorInput,
): Promise<Monologue> {
  const payload = {
    identity: input.profile.identity,
    prose_brief: input.prose_brief,
    instruction:
      'voice ONE short opening line as the seer. land them in the room. do not demonstrate insight yet.',
  };

  return sanitize(await adapter.invoke<Monologue>(
    {
      system: buildIntroActorSystem(actor),
      user: JSON.stringify(payload, null, 2),
      tool: INTRO_ACTOR_TOOL,
      model: 'deep',
      max_tokens: 200,
    },
    MonologueSchema,
  ));
}

export async function actorClosing(
  adapter: LLMAdapter,
  actor: Actor,
  input: ClosingActorInput,
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

  return sanitize(await adapter.invoke<Monologue>(
    {
      system: buildClosingActorSystem(actor),
      user: JSON.stringify(payload, null, 2),
      tool: CLOSING_ACTOR_TOOL,
      model: 'deep',
      max_tokens: 300,
    },
    MonologueSchema,
  ));
}

export async function actorChat(
  adapter: LLMAdapter,
  actor: Actor,
  input: ChatActorInput,
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
    instruction: 'respond to the subject as the seer. short.',
  };

  return sanitize(await adapter.invoke<Monologue>(
    {
      system: buildChatActorSystem(actor),
      user: JSON.stringify(payload, null, 2),
      tool: CHAT_ACTOR_TOOL,
      model: 'cognition',
      max_tokens: 300,
    },
    MonologueSchema,
  ));
}
