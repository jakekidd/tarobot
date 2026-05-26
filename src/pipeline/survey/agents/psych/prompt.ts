// PSYCH prompt template. Body lives in materials/prompts/psych.md
// (Vite ?raw import). Template uses {{TRANSCRIPT}}, {{VERBATIM_LOG}},
// {{DETECTIVE_HYPOTHESES}}, {{PSYCH_CANDIDATES_SO_FAR}}, {{RUN_IDX}},
// {{RUN_TOTAL}}.

import PSYCH_SYSTEM_RAW from '../../../../../materials/prompts/psych.md?raw';

export const PSYCH_SYSTEM_TEMPLATE = PSYCH_SYSTEM_RAW;
