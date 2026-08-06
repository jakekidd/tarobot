// Vesper's shelf — authored presence material (PULSE P3). Loaded like
// every other material so jade can edit it without a code change.

import ALMANAC_RAW from '../../../materials/persona/almanac.md?raw';

/** entries only — the authoring header stays out of her payload */
export const ALMANAC: string = ALMANAC_RAW.split('\n')
  .filter((l) => l.startsWith('- '))
  .join('\n');
