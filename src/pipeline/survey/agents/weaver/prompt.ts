// WEAVER prompt template. Body lives in materials/prompts/weaver.md
// (Vite ?raw import). Template uses {{TRANSCRIPT}}, {{VERBATIM_LOG}},
// {{DETECTIVE_HYPOTHESES}}, {{WEAVER_CANDIDATES_SO_FAR}}, {{RUN_IDX}},
// {{RUN_TOTAL}}.

import WEAVER_SYSTEM_RAW from '../../../../../materials/prompts/weaver.md?raw';

export const WEAVER_SYSTEM_TEMPLATE = WEAVER_SYSTEM_RAW;
