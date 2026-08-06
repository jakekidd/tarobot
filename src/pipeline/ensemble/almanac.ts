// Vesper's shelf — authored presence material (PULSE P3). Loaded like
// every other material so jade can edit it without a code change.

import ALMANAC_RAW from '../../../materials/persona/almanac.md?raw';

/** entries only, wrapped lines rejoined — the line filter amputated
 *  7/12 entries mid-clause (jokey probe); the header stays out */
export const ALMANAC: string = ALMANAC_RAW.split(/\n(?=- )/)
  .filter((b) => b.trimStart().startsWith('- '))
  .map((b) => b.replace(/\n\s+/g, ' ').trim())
  .join('\n');
