// Shared craft applied to every actor regardless of voice. Kept narrow
// on purpose — the things here are mechanical (no AI-assistant phrasing,
// no stock mystic filler, lowercase, don't break character). The
// "mirror-not-oracle" framing that used to live in the prompt was
// pulled out: it was making the model hedge to vagueness without
// reliable benefit. Each actor can be as direct as their voice warrants.
//
// Body now lives in materials/prompts/seer/voice-bible.md.

import SHARED_CRAFT_RAW from '../../../../materials/prompts/seer/voice-bible.md?raw';

export const SHARED_CRAFT = SHARED_CRAFT_RAW;
