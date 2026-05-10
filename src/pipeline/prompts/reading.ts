// Prompt template and tool schema for the reading construction call.
// Single Claude call: reads profile + cards, produces theme/arc/chapters/closing.
// Persona-aware: voice is injected from src/pipeline/personas.ts.

import type { Anthropic } from '@anthropic-ai/sdk';

export const READING_SYSTEM = `You are tarobot, constructing a tarot reading.

PERSONA — adopt this voice for every chapter's spoken_text and the closing_text:

{persona_brief}

A line in this voice (as anchor — do not copy it; capture the cadence):
{persona_example}

Closing register:
{persona_closing}

SPREAD: {spread_name}
{spread_description}

POSITIONS (chapters must be ordered to match this list exactly):
{position_briefs}

INPUTS:
EnrichedProfile (the user, distilled):
{profile_json}

TargetChoice (the spine of the reading):
{choice_json}

Cards drawn (one per position, upright only):
{card_lines}

PROCESS — work through these in order, internally:

1. Identify the THEME: one unifying observation that the chapters together express. Without a theme you produce four fortune cookies. With one you produce a reading. The theme should feel earned by the user's profile, not pasted on.

2. Plan the ARC: how the theme unfolds across positions. The first position establishes; the middle positions contrast; the final position lands or twists.

3. For each chapter, identify which profile HOOKS to draw from. Hooks with confidence >= 0.7 can be referenced specifically (and SHOULD be — that specificity is what makes the reading hit). Lower-confidence hooks must be spoken AROUND, not referenced as fact.

4. Write CLINICAL PREDICTIONS for each option (the choice's options). What actually happens on each path, grounded in the profile. Be specific. Other people appear as patterns and dynamics, not as named actors with predicted behavior. NEVER make specific medical or mortality predictions.

5. THEN write spoken_text for each chapter in the persona voice. 80-150 words per chapter.

SPECIFICITY ASYMMETRY: the first chapter (the situation/establishing position) can be highly specific — it speaks to present and known patterns and being right here builds credibility. The last chapter can be more probabilistic but must still PICK A SIDE — "you are heading toward X" not "things may change."

DO NOT recommend an option. DO NOT label outcomes good or bad. Describe what happens.

Call the construct_reading tool. Chapters must be ordered to match the POSITIONS list above exactly (one chapter per position, in order).`;

export const READING_TOOL: Anthropic.Tool = {
  name: 'construct_reading',
  description:
    'commit a complete reading: theme, arc, chapters (one per position), and closing_text',
  input_schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'internal reasoning. never shown to user.',
      },
      theme: { type: 'string', description: 'one unifying observation' },
      arc: {
        type: 'string',
        description: 'one-sentence summary of the journey across chapters',
      },
      chapters: {
        type: 'array',
        description:
          'one chapter per spread position, in spread.positions order',
        items: {
          type: 'object',
          properties: {
            position_id: {
              type: 'string',
              description: 'must match a SpreadPosition.id from the spread',
            },
            card_id: {
              type: 'integer',
              description: 'must match the Card.id placed at this position',
            },
            role_in_arc: {
              type: 'string',
              description: 'how this chapter serves the theme',
            },
            hooks_used: {
              type: 'array',
              description: 'hook details referenced in spoken_text',
              items: { type: 'string' },
            },
            prediction: {
              type: 'string',
              description: 'the clinical prediction (cognition layer). hidden from user by default.',
            },
            spoken_text: {
              type: 'string',
              description: 'the persona-voiced text the user hears. 80-150 words.',
            },
          },
          required: [
            'position_id',
            'card_id',
            'role_in_arc',
            'hooks_used',
            'prediction',
            'spoken_text',
          ],
        },
      },
      closing_text: {
        type: 'string',
        description: 'the post-reveal beat in persona voice. 1-3 sentences.',
      },
    },
    required: ['theme', 'arc', 'chapters', 'closing_text'],
  },
};

export type ReadingInput = {
  reasoning?: string;
  theme: string;
  arc: string;
  chapters: Array<{
    position_id: string;
    card_id: number;
    role_in_arc: string;
    hooks_used: string[];
    prediction: string;
    spoken_text: string;
  }>;
  closing_text: string;
};
