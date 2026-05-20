// Augur — survey-side outcome predictor. Replaces the deleted Compiler.
//
// Pipeline:
//   1. outline (sonnet, JSON tool) — names 2-4 outcomes, decides shape.
//   2. fill (opus deep, prose) — N parallel runs, one per outline entry,
//      each producing a freely-written markdown document for that outcome.
//
// Output: Outcome[]. Consumed by Seer (passed in via SeerOpts.outcomes)
// and read by all subsequent per-card / closing / intro cognition calls.

import type { LLMAdapter } from '../../llm/adapter';
import {
  AUGUR_OUTLINE_SCHEMA,
  AUGUR_OUTLINE_SYSTEM,
  AUGUR_OUTLINE_TOOL,
  AUGUR_FILL_SYSTEM,
} from '../prompts/augur';
import type { Outcome } from '../../seer/types';
import type { Profile } from '../../types';
import type { PickEvent, StoryObject } from '../types';

export type AugurInput = {
  profile: Profile;
  intention: string;
  surveyHistory: PickEvent[];
  /** The narrative cross-section the survey's detective built. When
   *  present, outcomes branch off story.fork. story also carries
   *  present_pressure + past_root + stakes which enrich the fill stage's
   *  document specificity. Null when the detective didn't commit one. */
  story?: StoryObject | null;
};

/** Two-stage run. Returns Outcome[] ready to seed the Seer. */
export async function runAugur(
  adapter: LLMAdapter,
  input: AugurInput,
): Promise<Outcome[]> {
  // ── Stage 1: outline ──
  const outlinePayload = {
    name: input.profile.identity?.name ?? 'the user',
    sun_sign: input.profile.identity?.sun_sign,
    intention: input.intention,
    // When the detective built a StoryObject, outcomes naturally branch
    // off story.fork. If story.fork is the stasis-as-fork fallback
    // (is_stasis=true), outcomes are "act on this" vs. "continue as
    // you are" — and the augur should still produce 2-4 outcomes by
    // splitting each side into texture variants.
    story_fork: input.story?.fork ?? null,
    story_present_pressure: input.story?.present_pressure ?? null,
    survey_history_compact: input.surveyHistory.map((p) => ({
      question: p.question_text,
      answer: p.answer,
    })),
    instruction:
      'name 2-4 outcomes this intention question opens onto. when story_fork is non-null, anchor outcomes on its two branches (a and b). id + label only. no prose. use the user\'s name in labels.',
  };

  const outline = await adapter.invoke<{
    outcomes: Array<{ id: string; label: string }>;
    reasoning: string;
  }>(
    {
      system: AUGUR_OUTLINE_SYSTEM,
      user: JSON.stringify(outlinePayload, null, 2),
      tool: AUGUR_OUTLINE_TOOL,
      model: 'cognition',
      max_tokens: 600,
    },
    AUGUR_OUTLINE_SCHEMA,
  );

  // ── Stage 2: fill (N parallel) ──
  // Each entry from the outline gets a deep-tier prose pass. We send a
  // rich context payload because the document needs both general
  // knowledge ("what is it like to get a cat") + user-specific
  // knowledge ("what would Jake getting a cat be like").
  const fillPromises = outline.outcomes.map(async (entry) => {
    const fillPayload = {
      outcome: entry,
      name: input.profile.identity?.name ?? 'the user',
      identity: input.profile.identity,
      cast: input.profile.cast,
      hunches: input.profile.hunches,
      highlights: input.profile.highlights,
      margin: input.profile.margin,
      intention: input.intention,
      // Story slots enrich the fill — present_pressure / past_root /
      // stakes give the writer the texture they need to ground the
      // outcome document in this specific user's situation.
      story: input.story
        ? {
            fork: input.story.fork,
            present_pressure: input.story.present_pressure,
            past_root: input.story.past_root,
            stakes: input.story.stakes,
            hooks: input.story.hooks,
          }
        : null,
      survey_history: input.surveyHistory.map((p) => ({
        question: p.question_text,
        options: p.options_shown,
        answer: p.answer,
      })),
      instruction:
        'write the markdown document for THIS outcome (above). past or present tense. specific. textured. the document is for another AI to read — prioritize concrete invented detail over abstraction. one witty specific minimum. return markdown only, starting with # OUTCOME.',
    };
    // Free-form prose — no tool, no schema. We invoke via the adapter
    // with a special freeform call.
    const document = await adapter.invokeFreeform(
      {
        system: AUGUR_FILL_SYSTEM,
        user: JSON.stringify(fillPayload, null, 2),
        model: 'deep',
        max_tokens: 2000,
      },
    );
    return {
      id: entry.id,
      label: entry.label,
      document: document.trim(),
    };
  });

  return Promise.all(fillPromises);
}
