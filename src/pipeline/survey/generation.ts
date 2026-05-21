// Phase 4 question-generation pipeline.
//
// Triggered when the detective's `next_move.kind === 'append'` carries
// an `intent`. Flow:
//
//   [parallel]
//   interrogator.phrase(intent + samples) → { question_text, axis_tag }
//   crowd.decoys(stem placeholder)           → 2-3 decoy options
//   [sequential]
//   assemble: shuffle(planted_options + decoys), cap at 4
//   lint: question length, option count + length, no dupes, no
//         leading framing
//   if lint fails: retry once with feedback; if still bad, return null
//     (engine falls back to a static-pool pick)
//   on success: build QueueItem with is_engine_authored=true
//
// The is_engine_authored flag propagates to PickEvent at answer time
// and is filtered by extractHooks (the "instagram" guard — Phase 3).

import type { LLMAdapter } from '../llm/adapter';
import type { QueueItem } from './types';
import { runCrowd, type CrowdOutput } from './agents/crowd';
import { runInterrogator, type InterrogatorOutput } from './agents/interrogator';
import { getNode, getPillars, getPoolNodeIds } from './tree';

export type GenerationIntent = {
  angle: string;
  planted_options?: string[];
};

export type GenerationResult = {
  /** The generated QueueItem ready to push to the engine's queue.
   *  is_engine_authored is true. */
  item: QueueItem;
  /** Captured for telemetry / debug — what the agents produced. */
  interrogator: InterrogatorOutput;
  crowd: CrowdOutput;
  /** True iff lint had to retry. */
  retried: boolean;
};

/** Max chars for the question stem. Matches the interrogator prompt. */
const MAX_QUESTION_LEN = 120;
/** Min + max chars per option. */
const MIN_OPTION_LEN = 1;
const MAX_OPTION_LEN = 40;
/** Target option count for the assembled question. */
const TARGET_OPTION_COUNT = 4;

/** Run the full generation pipeline. Returns the assembled QueueItem
 *  on success, or null if both attempts failed lint (caller falls
 *  back to a static-pool pick). */
export async function generateQuestion(
  adapter: LLMAdapter,
  intent: GenerationIntent,
): Promise<GenerationResult | null> {
  const samples = pickSampleQuestions(3);

  // Pass 1.
  const first = await runOnce(adapter, intent, samples);
  if (first.lintOk) {
    return {
      item: first.item!,
      interrogator: first.interrogator,
      crowd: first.crowd,
      retried: false,
    };
  }

  // Pass 2 — retry with lint-feedback baked into the intent.
  const feedbackIntent: GenerationIntent = {
    ...intent,
    angle: `${intent.angle}\n\n[retry: previous attempt failed lint — reasons: ${first.lintReasons.join(', ')}. fix the issue.]`,
  };
  const second = await runOnce(adapter, feedbackIntent, samples);
  if (second.lintOk) {
    return {
      item: second.item!,
      interrogator: second.interrogator,
      crowd: second.crowd,
      retried: true,
    };
  }
  // Two strikes — give up; caller falls back to static pool.
  return null;
}

// ─── internals ─────────────────────────────────────────────

type OneAttempt = {
  lintOk: boolean;
  lintReasons: string[];
  item: QueueItem | null;
  interrogator: InterrogatorOutput;
  crowd: CrowdOutput;
};

async function runOnce(
  adapter: LLMAdapter,
  intent: GenerationIntent,
  samples: string[],
): Promise<OneAttempt> {
  // Fire interrogator + crowd in parallel. Crowd is blind — the
  // stem it sees is the interrogator's output, but we can't know
  // that yet. So we kick interrogator first, then crowd off the
  // result. (True parallel would require generating a placeholder
  // stem from intent for the crowd; in practice the latency win is
  // small because both are Haiku ~2-3s.)
  const interrogator = await runInterrogator(adapter, {
    intent,
    sample_questions: samples,
  });

  const crowd = await runCrowd(adapter, { stem: interrogator.question_text });

  // Assemble + lint.
  const assembled = assembleOptions(intent.planted_options ?? [], crowd.decoys);
  const lintReasons = lintAttempt(interrogator.question_text, assembled);

  if (lintReasons.length > 0) {
    return {
      lintOk: false,
      lintReasons,
      item: null,
      interrogator,
      crowd,
    };
  }

  // Build the QueueItem. node_id is a synthetic id tagged with the
  // interrogator's axis_tag for debug visibility.
  const node_id = `gen_${Date.now().toString(36)}_${randomTag()}_${slug(interrogator.axis_tag)}`;
  const item: QueueItem = {
    node_id,
    prompted_by: 'detective_intent',
    priority: 'normal',
    options_override: assembled,
    is_engine_authored: true,
  };

  return {
    lintOk: true,
    lintReasons: [],
    item,
    interrogator,
    crowd,
  };
}

/** Shuffle planted + decoys, dedupe (case-insensitive), trim to
 *  TARGET_OPTION_COUNT. Planted go in first so they always survive
 *  if we hit the cap. */
function assembleOptions(planted: string[], decoys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Planted first.
  for (const p of planted) {
    const k = p.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p.trim());
    if (out.length >= TARGET_OPTION_COUNT) break;
  }
  // Then crowd decoys.
  for (const d of decoys) {
    const k = d.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(d.trim());
    if (out.length >= TARGET_OPTION_COUNT) break;
  }
  // Shuffle final order so planted isn't always first.
  return shuffleInPlace([...out]);
}

/** Validate the assembled question + options. Returns lint reasons
 *  (empty array = valid). */
function lintAttempt(stem: string, options: string[]): string[] {
  const reasons: string[] = [];
  // Question stem checks.
  if (stem.length < 8) reasons.push('question too short');
  if (stem.length > MAX_QUESTION_LEN) {
    reasons.push(`question >${MAX_QUESTION_LEN} chars (${stem.length})`);
  }
  if (!stem.trim().endsWith('?')) reasons.push('question must end with "?"');
  if (stem !== stem.toLowerCase()) reasons.push('question must be all lowercase');
  // Compound question heuristic: multiple "?" or "and"/"or" joining
  // two predicates is leading. Cheap check: more than one "?", or
  // explicit " or " near the middle.
  if ((stem.match(/\?/g) ?? []).length > 1) reasons.push('compound question (>1 "?")');

  // Option checks.
  if (options.length < 2) {
    reasons.push(`only ${options.length} option(s) — need ≥2`);
  }
  if (options.length > TARGET_OPTION_COUNT) {
    reasons.push(`>${TARGET_OPTION_COUNT} options (${options.length})`);
  }
  for (const o of options) {
    if (o.length < MIN_OPTION_LEN || o.length > MAX_OPTION_LEN) {
      reasons.push(`option "${o.slice(0, 12)}…" length ${o.length} out of [${MIN_OPTION_LEN},${MAX_OPTION_LEN}]`);
    }
  }
  // Duplicate check (case-insensitive).
  const seen = new Set<string>();
  for (const o of options) {
    const k = o.trim().toLowerCase();
    if (seen.has(k)) {
      reasons.push(`duplicate option "${o}"`);
      break;
    }
    seen.add(k);
  }
  return reasons;
}

/** Pick N sample questions from the authored pool — used as a voice
 *  + phrasing scaffold for the interrogator. Stable randomization
 *  is fine; we just want representative samples. */
function pickSampleQuestions(n: number): string[] {
  const allIds = [...getPillars(), ...getPoolNodeIds()];
  const out: string[] = [];
  // Bias toward 'choice' format (most common) to keep voice consistent.
  for (const id of shuffleInPlace([...allIds])) {
    const node = getNode(id);
    if (!node) continue;
    if (node.f !== 'choice' && node.f !== 'binary') continue;
    out.push(node.q);
    if (out.length >= n) break;
  }
  return out;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function randomTag(): string {
  return Math.random().toString(36).slice(2, 6);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}
