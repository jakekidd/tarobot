// Diviner prompt template. Body lives in materials/prompts/diviner.md
// (Vite ?raw import) so non-coders edit on GitHub.
//
// The template uses {{PLACEHOLDER}} tokens the runner substitutes at
// call time: {{OBJECTIVE}}, {{TRANSCRIPT}}, {{HYPOTHESES_SO_FAR}},
// {{GUESS_QUEUE}}, {{VERBATIM_LOG}}, {{DIVINER_THINKING_TRANSCRIPT}}.

import DIVINER_SYSTEM_RAW from '../../../../../materials/prompts/diviner.md?raw';

export const DIVINER_SYSTEM_TEMPLATE = DIVINER_SYSTEM_RAW;
