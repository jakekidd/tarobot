import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from '../claude';
import { MODELS } from '../claude';
import { computeSunSign } from '../astrology';
import type { ClatNote, Profile, Question, Survey } from '../types';
import { findQuestion } from '../clat/pool';
import { COMPILER_SYSTEM, COMPILER_TOOL, type CompilerOutput } from './prompts/compiler';

/**
 * Single-shot detective pass between survey and engine.
 * Produces (a) the seed Profile and (b) up to 3 opener Questions.
 *
 * Cost: 1 LLM call. The user can wait 10-30s here — show "the witch
 * is preparing" loading state.
 */
export async function compile(
  client: ClaudeClient,
  survey: Survey,
  clatNotes: ClatNote[] = [],
): Promise<{ profile: Profile; openers: Question[]; raw: CompilerOutput }> {
  // Derive the sun sign once so cognition can use it, and so the
  // Compiler doesn't need an astrology table in its prompt.
  const birthdayAnswer = survey.answers.find((a) => a.question_id === 'birthday');
  const birthMonthDay = birthdayAnswer?.passed ? undefined : birthdayAnswer?.picked[0];
  const sunSign = birthMonthDay ? computeSunSign(birthMonthDay) : null;

  const userPayload = {
    survey_answers: survey.answers.map((a) => {
      const q = findQuestion(a.question_id);
      return {
        question_id: a.question_id,
        question_text: q?.text,
        category: q?.category,
        picked: a.picked,
        passed: a.passed,
        interpretation_per_pick: a.picked.map((p) => q?.interpretation[p]),
      };
    }),
    answer_count: survey.answers.length,
    derived: {
      sun_sign: sunSign,           // null if no birthday given
    },
    clat_notes: clatNotes,         // Clat's accumulated observations during the survey
  };

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 4000,
    system: COMPILER_SYSTEM,
    tools: [COMPILER_TOOL],
    tool_choice: { type: 'tool', name: 'compile_seed' },
    messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
  });

  const out = readToolUse<CompilerOutput>(response, 'compile_seed');

  const profile: Profile = {
    identity: {
      ...out.identity,
      // Patch the derived fields ourselves — the model doesn't need to compute them.
      birth_month_day: birthMonthDay ?? out.identity.birth_month_day,
      sun_sign: sunSign ?? undefined,
    },
    candidates: out.candidates,
    cast: out.cast.map((c) => ({ ...c, last_referenced_turn: 0 })),
    threads: [],
    hunches: out.hunches.map((h) => ({ ...h, age_turns: 0 })),
    margin: out.margin,
    cognition_log: out.cognition_log,
    highlights: [],
    brief: out.brief,
    ready_to_close: false,
    version: 1,
  };

  const openers: Question[] = out.openers.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options.slice(0, 4),
    responses: q.responses.slice(0, 4),
    fork_lead: q.fork_lead,
    depth: q.depth,
    meta: { based_on_profile_version: 1, rationale: q.rationale },
  }));

  return { profile, openers, raw: out };
}

/**
 * RNG-weighted opener pick. Compiler returns up to 3 in preference order;
 * we roll 50/30/20 for slots 1/2/3 and fall back upward if a slot is empty.
 */
export function pickOpener(openers: Question[], rng: () => number = Math.random): Question | null {
  if (openers.length === 0) return null;
  const weights = [0.5, 0.3, 0.2].slice(0, openers.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return openers[i] ?? openers[0]!;
  }
  return openers[0]!;
}

function readToolUse<T>(response: Anthropic.Message, name: string): T {
  const block = response.content.find(
    (b) => b.type === 'tool_use' && b.name === name,
  );
  if (!block || block.type !== 'tool_use') {
    throw new Error(`compiler: tool '${name}' not called (stop_reason=${response.stop_reason})`);
  }
  return block.input as T;
}
