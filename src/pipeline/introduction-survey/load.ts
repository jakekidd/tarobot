// Loads + validates materials/survey.json. Imported as a raw string (the
// repo's convention for author-edited materials) and parsed through the Zod
// contract, so a malformed survey fails loudly at boot instead of limping.

import surveyRaw from '../../../materials/survey.json?raw';
import { SurveyDocSchema, type SurveyDoc } from './schema';

let cached: SurveyDoc | null = null;

/** The validated survey document. Parsed once, then cached. */
export function loadSurvey(): SurveyDoc {
  if (cached) return cached;
  cached = SurveyDocSchema.parse(JSON.parse(surveyRaw));
  return cached;
}
