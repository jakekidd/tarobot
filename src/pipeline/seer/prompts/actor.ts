// Actor-layer prompts for the reading. Four prompt builders:
//   - buildPerCardActorSystem: voices one beat from a clinical Set.
//   - buildIntroActorSystem:   voices the opening line.
//   - buildClosingActorSystem: voices the outro from a closing Set.
//   - buildChatActorSystem:    responds to a user chat between flips.
//
// The actor IS the seer onstage. The voice/diction/signature-moves
// come from the selected Actor (see ../actors/) — the prompts below
// stitch together SHARED_CRAFT + actor.identity + prompt-specific
// instructions per call.
//
// Per-call instructions now live in materials/prompts/seer/actor-*.md
// and are imported via Vite ?raw. The builders compose them with the
// actor's voice bible at runtime.

import { z } from 'zod';
import PER_CARD_ACTOR_BODY from '../../../../materials/prompts/seer/actor-per-card.md?raw';
import INTRO_ACTOR_BODY from '../../../../materials/prompts/seer/actor-intro.md?raw';
import CLOSING_ACTOR_BODY from '../../../../materials/prompts/seer/actor-closing.md?raw';
import CHAT_ACTOR_BODY from '../../../../materials/prompts/seer/actor-chat.md?raw';
import { MonologueSchema } from '../schemas';
import { SHARED_CRAFT, type Actor } from '../actors';
import type { ToolDef } from '../../llm/adapter';

function voiceBible(actor: Actor): string {
  return `${SHARED_CRAFT}\n\n${actor.identity}`;
}

// ─── Per-card actor ────────────────────────────────────────────

export function buildPerCardActorSystem(actor: Actor): string {
  return `${voiceBible(actor)}\n\n${PER_CARD_ACTOR_BODY}`;
}

export const PER_CARD_ACTOR_TOOL: ToolDef = {
  name: 'voice_beat',
  description: 'voice one card-beat as the seer, performing from the given Set.',
  input_schema: z.toJSONSchema(MonologueSchema) as Record<string, unknown>,
};

// ─── Intro actor ───────────────────────────────────────────────

export function buildIntroActorSystem(actor: Actor): string {
  return `${voiceBible(actor)}\n\n${INTRO_ACTOR_BODY}`;
}

export const INTRO_ACTOR_TOOL: ToolDef = {
  name: 'voice_intro',
  description: 'voice the seer\'s opening line, before any cards flip.',
  input_schema: z.toJSONSchema(MonologueSchema) as Record<string, unknown>,
};

// ─── Closing actor ─────────────────────────────────────────────

export function buildClosingActorSystem(actor: Actor): string {
  return `${voiceBible(actor)}\n\n${CLOSING_ACTOR_BODY}`;
}

export const CLOSING_ACTOR_TOOL: ToolDef = {
  name: 'voice_closing',
  description: 'voice the seer\'s outro line after all four cards.',
  input_schema: z.toJSONSchema(MonologueSchema) as Record<string, unknown>,
};

// ─── Chat actor ────────────────────────────────────────────────

export function buildChatActorSystem(actor: Actor): string {
  return `${voiceBible(actor)}\n\n${CHAT_ACTOR_BODY}`;
}

export const CHAT_ACTOR_TOOL: ToolDef = {
  name: 'voice_chat',
  description: 'voice the seer\'s reply to a user chat message.',
  input_schema: z.toJSONSchema(MonologueSchema) as Record<string, unknown>,
};
