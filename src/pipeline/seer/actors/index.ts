// Actor registry. Default actor governs every reading unless the
// constructor caller passes a specific id. New actors: drop a new file
// in this folder exporting an Actor, register it in ACTORS below, and
// extend ActorId in ./types.

import type { Actor, ActorId } from './types';
import { GEOMETER } from './geometer';
import { VISITOR } from './visitor';

export const ACTORS: Record<ActorId, Actor> = {
  geometer: GEOMETER,
  visitor: VISITOR,
};

// v2 default — the silly alien visitor. The geometer (clinical alien)
// stays in the registry as an opt-in for users who want the cold
// instrument register.
export const DEFAULT_ACTOR_ID: ActorId = 'visitor';

export function getActor(id?: ActorId): Actor {
  return ACTORS[id ?? DEFAULT_ACTOR_ID];
}

export { SHARED_CRAFT } from './shared-craft';
export type { Actor, ActorId } from './types';
