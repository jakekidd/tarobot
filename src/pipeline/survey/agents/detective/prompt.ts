// Detective prompt template. Body lives in materials/prompts/detective.md
// (Vite ?raw import) so non-coders edit on GitHub.
//
// The template uses {{PLACEHOLDER}} tokens the runner substitutes at
// call time: {{OBJECTIVE}}, {{TRANSCRIPT}}, {{HYPOTHESES_SO_FAR}},
// {{ASSERTION_QUEUE}}, {{VERBATIM_LOG}}, {{DETECTIVE_THINKING_TRANSCRIPT}}.

import DETECTIVE_SYSTEM_RAW from '../../../../../materials/prompts/detective.md?raw';

export const DETECTIVE_SYSTEM_TEMPLATE = DETECTIVE_SYSTEM_RAW;
