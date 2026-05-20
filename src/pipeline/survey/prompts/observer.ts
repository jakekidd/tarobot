// Observer — stage 1 of the survey pipeline.
//
// One job: metabolize the user's latest answer into PROFILE updates.
// What did the user just tell us? File it. The Observer doesn't strategize
// (that's the Detective) and doesn't pick the next question (that's the
// Interrogator).
//
// Prompt body now lives in materials/prompts/observer.md and is imported
// via Vite ?raw — single source of truth, editable by non-coders on
// GitHub, build picks it up automatically.

import { z } from 'zod';
import OBSERVER_SYSTEM_RAW from '../../../../materials/prompts/observer.md?raw';
import { ObserverOutputSchema } from '../schemas';
import type { ToolDef } from '../../llm/adapter';

export const OBSERVER_SYSTEM = OBSERVER_SYSTEM_RAW;

export const OBSERVER_TOOL: ToolDef = {
  name: 'observer_metabolize',
  description: 'metabolize the latest answer into profile section notes + cast updates.',
  input_schema: z.toJSONSchema(ObserverOutputSchema) as Record<string, unknown>,
};
