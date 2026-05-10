// Prompt template and tool schema for finalizing the EnrichedProfile after
// the interview loop completes. Constructs a TargetChoice from highest-tension
// disclosures if no concrete fork has surfaced.

import type { Anthropic } from '@anthropic-ai/sdk';

export const FINALIZE_SYSTEM = `You are tarobot's cognition layer, finalizing the user profile after the interview. The reading construction phase is next; what you produce here is its only input besides the cards.

Your job: take the accumulated state (survey, partial profile, choice candidates, conversation history) and produce a fully realized EnrichedProfile with a single TargetChoice.

CURRENT STATE:
- Survey: {survey_json}
- Partial profile so far: {partial_profile_json}
- Choice candidates: {candidates_json}
- Conversation history follows in messages.

INSTRUCTIONS:

1. Pick the TARGET CHOICE.
   - If candidates contain a STATED choice: pick the one with highest engagement * stakes
   - Else if candidates contain an INFERRED choice with engagement >= 3: pick it; mark source="inferred"
   - Else CONSTRUCT one from the highest-tension domain in the disclosures: frame as "act on this vs. continue as you are." Mark source="constructed".

2. Normalize the TargetChoice:
   - description: one sentence, the user's language where possible
   - options: EXACTLY 2 options. If the user's situation has more, collapse to the two most consequential. Each option has a short {name} (1-3 words) and a {summary} (one sentence).
   - stakes: a phrase, not a number. What is at risk on each side.
   - time_horizon: weeks / months / year+
   - user_blindspots: 1-3 paths or consequences they have NOT been considering. Specific.
   - confidence: 0..1. How sure you are this is the right choice to read against.

3. Fill out the rest of the EnrichedProfile:
   - hooks: keep all interview hooks; add any from the survey that weren't already captured (familiar pick, register pick, "on my mind"). Keep confidences honest.
   - patterns: must be fully populated. Best inference for each field if not already set.
   - change_vector: one observation about a force already moving in their life that bears on the choice. Be specific.

4. Quality bar:
   - The TargetChoice must feel like a description of THIS user's situation, not a horoscope-grade generic. If you find yourself writing "love or fear," "courage or comfort" — start over and use the user's actual circumstances.
   - Hooks must be specific. "She mentioned her sister" is a hook. "She seems thoughtful" is not.

Call the finalize_profile tool with your structured output.`;

export const FINALIZE_TOOL: Anthropic.Tool = {
  name: 'finalize_profile',
  description: 'commit the final EnrichedProfile and TargetChoice',
  input_schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'internal reasoning. never shown to user.',
      },
      target_choice: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                summary: { type: 'string' },
              },
              required: ['name', 'summary'],
            },
          },
          source: {
            type: 'string',
            enum: ['stated', 'inferred', 'constructed'],
          },
          stakes: { type: 'string' },
          time_horizon: {
            type: 'string',
            enum: ['weeks', 'months', 'year+'],
          },
          user_blindspots: {
            type: 'array',
            items: { type: 'string' },
          },
          confidence: { type: 'number' },
        },
        required: [
          'description',
          'options',
          'source',
          'stakes',
          'time_horizon',
          'user_blindspots',
          'confidence',
        ],
      },
      hooks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            detail: { type: 'string' },
            source: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['detail', 'source', 'confidence'],
        },
      },
      patterns: {
        type: 'object',
        properties: {
          language_register: { type: 'string' },
          self_reflection_level: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
          },
          skepticism_posture: {
            type: 'string',
            enum: ['skeptic-fun', 'curious', 'believer', 'distressed'],
          },
          avoidances: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'language_register',
          'self_reflection_level',
          'skepticism_posture',
          'avoidances',
        ],
      },
      change_vector: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          relevance_to_choice: { type: 'string' },
        },
        required: ['description', 'relevance_to_choice'],
      },
    },
    required: [
      'target_choice',
      'hooks',
      'patterns',
      'change_vector',
    ],
  },
};

export type FinalizeInput = {
  reasoning?: string;
  target_choice: {
    description: string;
    options: Array<{ name: string; summary: string }>;
    source: 'stated' | 'inferred' | 'constructed';
    stakes: string;
    time_horizon: 'weeks' | 'months' | 'year+';
    user_blindspots: string[];
    confidence: number;
  };
  hooks: Array<{ detail: string; source: string; confidence: number }>;
  patterns: {
    language_register: string;
    self_reflection_level: 'low' | 'medium' | 'high';
    skepticism_posture: 'skeptic-fun' | 'curious' | 'believer' | 'distressed';
    avoidances: string[];
  };
  change_vector: { description: string; relevance_to_choice: string };
};
