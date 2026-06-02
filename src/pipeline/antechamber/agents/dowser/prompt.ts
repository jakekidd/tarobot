// Dowser prompt template. Body lives in materials/prompts/dowser.md
// (Vite ?raw import) so non-coders edit on GitHub.
//
// The template uses {{PLACEHOLDER}} tokens the runner substitutes at
// call time: {{OBJECTIVE}}, {{TRANSCRIPT}}, {{HYPOTHESES_SO_FAR}},
// {{GUESS_QUEUE}}, {{VERBATIM_LOG}}, {{DOWSER_THINKING_TRANSCRIPT}}.

import DOWSER_SYSTEM_RAW from '../../../../../materials/prompts/dowser.md?raw';

export const DOWSER_SYSTEM_TEMPLATE = DOWSER_SYSTEM_RAW;
