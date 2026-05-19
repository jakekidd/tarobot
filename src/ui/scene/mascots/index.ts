// Public surface for mascots. The scene imports from here, never reaches
// into individual mascot files. Adding a new mascot:
//   1. write src/ui/scene/mascots/<name>.ts with a createXMascot() factory
//      that returns a Mascot
//   2. add its id to MascotId
//   3. add a case in createMascot()
// Done.

import { createCatMascot } from './cat';
import { createTurtleMascot } from './turtle';
import type { Mascot } from './types';

export type { Mascot, MascotContext } from './types';

export const MASCOT_IDS = ['turtle', 'cat'] as const;
export type MascotId = (typeof MASCOT_IDS)[number];
export const DEFAULT_MASCOT_ID: MascotId = 'turtle';

/** Factory — selects the mascot impl. Construction is lazy (each mascot
 *  loads its own assets when called). Pure function: same id → same shape. */
export function createMascot(id: MascotId): Mascot {
  switch (id) {
    case 'cat':    return createCatMascot();
    case 'turtle': return createTurtleMascot();
  }
}

/** Migrates the legacy 'clat' mascot id to its renamed-equivalent 'cat'.
 *  Any other value is passed through unchanged. */
const LEGACY_CAT_ID = 'clat';
function migrateLegacyId(id: string | null | undefined): string | null | undefined {
  return id === LEGACY_CAT_ID ? 'cat' : id;
}

/**
 * Resolve the mascot id to use at app boot. Priority:
 *   1. URL param `?mascot=cat` (dev / link-share testing). Legacy
 *      'clat' is migrated to 'cat'.
 *   2. localStorage user setting (with the same migration).
 *   3. DEFAULT_MASCOT_ID
 */
export function resolveMascotId(stored?: MascotId | string | null): MascotId {
  if (typeof window !== 'undefined') {
    const fromUrl = migrateLegacyId(new URLSearchParams(window.location.search).get('mascot'));
    if (fromUrl && (MASCOT_IDS as readonly string[]).includes(fromUrl)) {
      return fromUrl as MascotId;
    }
  }
  const storedMigrated = migrateLegacyId(stored);
  if (storedMigrated && (MASCOT_IDS as readonly string[]).includes(storedMigrated)) {
    return storedMigrated as MascotId;
  }
  return DEFAULT_MASCOT_ID;
}
