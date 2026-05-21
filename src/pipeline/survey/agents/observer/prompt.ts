// Observer prompt + tool spec. The system body lives in
// materials/prompts/observer.md (Vite ?raw import) so non-coders can
// edit on GitHub and Vercel rebuilds with the new content.

import { z } from 'zod';
import OBSERVER_SYSTEM_RAW from '../../../../../materials/prompts/observer.md?raw';
import { ObserverOutputSchema } from './schema';
import type { ToolDef } from '../../../llm/adapter';

export const OBSERVER_SYSTEM = OBSERVER_SYSTEM_RAW;

export const OBSERVER_TOOL: ToolDef = {
  name: 'observer_metabolize',
  description: 'metabolize the latest answer into profile section notes + cast updates.',
  input_schema: z.toJSONSchema(ObserverOutputSchema) as Record<string, unknown>,
};
