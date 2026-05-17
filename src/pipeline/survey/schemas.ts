// Runtime schemas for agent I/O. Every Observer / Detective /
// Interrogator / Compiler response is validated through these at the
// adapter boundary. Malformed model output throws a typed error; the
// engine catches and falls back.

import { z } from 'zod';

// ─── shared atoms ───────────────────────────────────────

const NoteCategory = z.enum([
  'observation', 'suspicion', 'gossip_flag', 'confirmed_thread', 'ground_truth',
]);
const Confidence = z.enum(['low', 'medium', 'high']);
const StakesDomain = z.enum(['relational', 'occupational', 'identity', 'geographic', 'unknown']);
const ThreadStatus = z.enum(['open', 'awaiting_confirm', 'confirmed', 'refuted']);
const HypothesisStatus = z.enum(['inferred', 'testing', 'confirmed', 'refuted']);
const ContradictionSeverity = z.enum(['minor', 'notable', 'load_bearing']);
const HookSource = z.enum(['pass', 'latency_outlier', 'admission', 'multi_select_pattern', 'inferred']);
const Posture = z.enum(['warm', 'careful', 'direct']);
const ProfileSectionKey = z.enum([
  'identity', 'state', 'relational', 'self_model', 'decision_context', 'patterns',
]);

const CastMember = z.object({
  label: z.string(),
  likely_role: z.string().optional(),
  supporting_picks: z.array(z.string()),
  confidence: Confidence,
});

const ChoiceShape = z.object({
  fork: z.string(),
  fork_a: z.object({
    label: z.string(),
    supporting_picks: z.array(z.string()),
    pull_weight: z.number(),
  }),
  fork_b: z.object({
    label: z.string(),
    supporting_picks: z.array(z.string()),
    pull_weight: z.number(),
  }),
  is_stated: z.boolean(),
  is_constructed: z.boolean(),
  stakes_domain: StakesDomain,
  confidence: Confidence,
  open_questions: z.array(z.string()),
});

const Hypothesis = z.object({
  id: z.string(),
  description: z.string(),
  supporting_picks: z.array(z.string()),
  contradicting_picks: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  status: HypothesisStatus,
});

const Contradiction = z.object({
  description: z.string(),
  pick_a: z.string(),
  pick_b: z.string(),
  severity: ContradictionSeverity,
});

const Hook = z.object({
  description: z.string(),
  source: HookSource,
  source_pick: z.string().optional(),
});

// ─── Observer ───────────────────────────────────────────

export const ObserverOutputSchema = z.object({
  notes_to_append: z.array(z.object({
    text: z.string(),
    section: ProfileSectionKey,
    category: NoteCategory,
    confidence: Confidence,
    source_picks: z.array(z.string()),
  })),
  cast_updates: z.array(CastMember),
  reasoning: z.string(),
});

// ─── Detective ──────────────────────────────────────────

export const DetectiveOutputSchema = z.object({
  hypothesis_updates: z.array(Hypothesis),
  hypothesis_refutes: z.array(z.string()),
  choice_update: ChoiceShape.nullable(),
  contradictions_found: z.array(Contradiction),
  hooks_found: z.array(Hook),
  thread_updates: z.array(z.object({
    thread_id: z.string(),
    status: ThreadStatus,
  })),
  posture: Posture.nullable(),
  reasoning: z.string(),
});

// ─── Interrogator ───────────────────────────────────────

export const InterrogatorOutputSchema = z.object({
  next_question: z.object({
    node_id: z.string(),
    preamble: z.string().optional(),
    options_override: z.array(z.string()).optional(),
  }),
  reasoning: z.string(),
});

// ─── Compiler ───────────────────────────────────────────

const LegacyQuestion = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.string()),
  responses: z.array(z.string()),
  fork_lead: z.string().optional(),
  depth: z.enum(['warm', 'medium', 'edge']),
  meta: z.object({
    based_on_profile_version: z.number(),
    rationale: z.string(),
  }),
});

/**
 * What the LLM emits — JUST the synthesis bits. The engine maps the rest of
 * the legacy Profile from EngineState deterministically, so we don't ask the
 * model to construct ~11 nested shapes correctly each time.
 */
export const CompilerLLMOutputSchema = z.object({
  brief_summary: z.string(),
  prose_brief: z.string(),
  openers: z.array(LegacyQuestion),
});
