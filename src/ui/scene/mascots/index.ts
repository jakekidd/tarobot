// Public surface for mascots. The scene imports from here, never reaches
// into individual mascot files. Adding a new mascot:
//   1. write src/ui/scene/mascots/<name>.ts with a createXMascot() factory
//      that returns a Mascot
//   2. add its id to MascotId
//   3. add a case in createMascot()
// Done.

import { createClatMascot } from './clat';
import { createTurtleMascot } from './turtle';
import type { Mascot } from './types';

export type { Mascot, MascotContext } from './types';

export const MASCOT_IDS = ['turtle', 'clat'] as const;
export type MascotId = (typeof MASCOT_IDS)[number];
export const DEFAULT_MASCOT_ID: MascotId = 'turtle';

/** Factory — selects the mascot impl. Construction is lazy (each mascot
 *  loads its own assets when called). Pure function: same id → same shape. */
export function createMascot(id: MascotId): Mascot {
  switch (id) {
    case 'clat':   return createClatMascot();
    case 'turtle': return createTurtleMascot();
  }
}

/**
 * Resolve the mascot id to use at app boot. Priority:
 *   1. URL param `?mascot=clat` (dev / link-share testing)
 *   2. localStorage user setting
 *   3. DEFAULT_MASCOT_ID
 */
export function resolveMascotId(stored?: MascotId | null): MascotId {
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('mascot');
    if (fromUrl && (MASCOT_IDS as readonly string[]).includes(fromUrl)) {
      return fromUrl as MascotId;
    }
  }
  if (stored && (MASCOT_IDS as readonly string[]).includes(stored)) {
    return stored;
  }
  return DEFAULT_MASCOT_ID;
}
