import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from '../claude';
import { MODELS } from '../claude';
import {
  computeSunSign,
  parseBirthDate,
  computeAstroProfile,
  summarizeAstro,
} from '../astrology';
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
  // Derive every astrology field we can from the birthday answer so the
  // Compiler doesn't have to compute (and the model can't get it wrong).
  // Supported answer formats: "YYYY-MM-DD" (new) or "MM-DD" (legacy).
  const birthdayAnswer = survey.answers.find((a) => a.question_id === 'birthday');
  const birthRaw = birthdayAnswer?.passed ? undefined : birthdayAnswer?.picked[0];
  const birthDate = birthRaw ? parseBirthDate(birthRaw) : null;
  const astro = birthDate ? computeAstroProfile(birthDate) : null;
  const sunSign = astro ? astro.sunSign : (birthRaw ? computeSunSign(birthRaw) : null);

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
      sun_sign: sunSign,
      life_path: astro?.lifePath ?? null,
      tarot_birth_card: astro?.tarotBirthCard.name ?? null,
      astro_summary: astro ? summarizeAstro(astro) : null,
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
      // Patch every derived field ourselves — the model doesn't compute them.
      birth_date: birthDate
        ? `${birthDate.year}-${String(birthDate.month).padStart(2, '0')}-${String(birthDate.day).padStart(2, '0')}`
        : out.identity.birth_date,
      birth_month_day: birthDate
        ? `${String(birthDate.month).padStart(2, '0')}-${String(birthDate.day).padStart(2, '0')}`
        : (birthRaw ?? out.identity.birth_month_day),
      sun_sign: sunSign ?? undefined,
      life_path: astro?.lifePath,
      tarot_birth_card: astro
        ? { number: astro.tarotBirthCard.number, name: astro.tarotBirthCard.name }
        : undefined,
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
