// Seeder prompt template. Body lives in materials/prompts/seeder.md
// (Vite ?raw import). Template uses {{TRANSCRIPT}}, {{THIS_TURN}},
// and {{VERBATIM_LOG}} placeholders the runner substitutes at call
// time.

import SEEDER_SYSTEM_RAW from '../../../../../materials/prompts/seeder.md?raw';

export const SEEDER_SYSTEM_TEMPLATE = SEEDER_SYSTEM_RAW;
