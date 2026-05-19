// Actor = the onstage seer persona. The director's clinical Set is
// voice-agnostic; the actor is the layer that performs the Set as a
// specific character. New voices = new files in this folder + register
// in index.ts.

export type ActorId = 'geometer';

export interface Actor {
  id: ActorId;
  /** Human-readable label for debug/logging. */
  displayName: string;
  /** The identity block injected into every actor system prompt:
   *  worldview, voice/diction, signature moves, sample beat. */
  identity: string;
}
