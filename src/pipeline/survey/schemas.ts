// Runtime schemas for agent I/O. Every Observer / Investigator / Compiler
// response is validated through these at the adapter boundary. Malformed
// model output throws a typed error; the engine catches and falls back.

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
const AnswerFormat = z.enum(['text', 'date', 'choice', 'binary', 'multi', 'matrix']);
const Engagement = z.enum(['high', 'normal', 'low']);

const NoteToAppend = z.object({
  text: z.string(),
  category: NoteCategory,
  source_picks: z.array(z.string()),
  confidence: Confidence,
});

const CastMember = z.object({
  label: z.string(),
  likely_role: z.string().optional(),
  supporting_picks: z.array(z.string()),
  confidence: Confidence,
});

const Choice = z.object({
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
  notes_to_append: z.array(NoteToAppend),
  cast_updates: z.array(CastMember),
  contradictions_found: z.array(Contradiction),
  hooks_found: z.array(Hook),
  choice_update: Choice.nullable(),
  hypotheses_updates: z.array(Hypothesis),
  engagement_signal: Engagement,
  phase_advance_signal: z.boolean(),
  thread_status_updates: z.array(z.object({
    thread_id: z.string(),
    status: ThreadStatus,
  })),
  ready_to_close: z.boolean(),
  recommended_posture_update: z.string().optional(),
});

// ─── Investigator ───────────────────────────────────────

export const InvestigatorOutputSchema = z.object({
  next_question: z.object({
    node_id: z.string(),
    text: z.string().optional(),
    options: z.array(z.string()).optional(),
    fmt: AnswerFormat.optional(),
    prompted_by: z.string().nullable(),
  }),
  preamble: z.string(),
  queue_additions: z.array(z.object({
    node_id: z.string(),
    prompted_by: z.string().nullable(),
    priority: z.enum(['normal', 'high', 'urgent']),
  })).optional(),
  reasoning: z.string(),
});

// ─── Compiler ───────────────────────────────────────────

const LegacyProfileIdentity = z.object({
  name: z.string().optional(),
  birth_date: z.string().optional(),
  birth_month_day: z.string().optional(),
  sun_sign: z.string().optional(),
  life_path: z.number().optional(),
  tarot_birth_card: z.object({
    number: z.number(),
    name: z.string(),
  }).optional(),
  came_with: z.string().optional(),
  notes: z.string(),
});

const LegacyChoice = z.object({
  id: z.string(),
  description: z.string(),
  options: z.array(z.object({
    name: z.string(),
    summary: z.string().optional(),
  })),
  source: z.enum(['stated', 'inferred', 'constructed']),
  scores: z.object({
    stakes: z.number(),
    time_proximity: z.number(),
    user_engagement: z.number(),
  }),
  stakes: z.string().optional(),
  time_horizon: z.enum(['weeks', 'months', 'year+']).optional(),
  blindspots: z.array(z.string()).optional(),
  is_target: z.boolean(),
  confidence: z.number(),
  notes: z.string(),
});

const LegacyCast = z.object({
  role: z.string(),
  name: z.string().optional(),
  valence: z.string(),
  last_referenced_turn: z.number(),
});

const LegacyHunch = z.object({
  suspicion: z.string(),
  grounded_in: z.string(),
  confidence: z.number(),
  age_turns: z.number(),
});

const LegacyHighlight = z.object({
  id: z.string(),
  topic: z.string(),
  reason: z.string(),
  introduced_turn: z.number(),
  ttl: z.number(),
  salience: z.enum(['low', 'medium', 'high']),
});

const LegacyThread = z.object({
  pattern: z.string(),
  observations: z.array(z.number()),
  salience: z.number(),
});

const LegacyProfile = z.object({
  identity: LegacyProfileIdentity,
  candidates: z.array(LegacyChoice),
  cast: z.array(LegacyCast),
  threads: z.array(LegacyThread),
  hunches: z.array(LegacyHunch),
  margin: z.string(),
  cognition_log: z.string(),
  highlights: z.array(LegacyHighlight),
  brief: z.string(),
  ready_to_close: z.boolean(),
  version: z.number(),
});

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

export const CompilerOutputSchema = z.object({
  profile: LegacyProfile,
  openers: z.array(LegacyQuestion),
  prose_brief: z.string(),
});
