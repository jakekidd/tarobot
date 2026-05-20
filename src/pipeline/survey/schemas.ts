// Runtime schemas for agent I/O. Every Observer / Detective /
// Interrogator / Compiler response is validated through these at the
// adapter boundary. Malformed model output throws a typed error; the
// engine catches and falls back.

import { z } from 'zod';

// ─── shared atoms ───────────────────────────────────────

const Confidence = z.enum(['low', 'medium', 'high']);
const StakesDomain = z.enum(['relational', 'occupational', 'identity', 'geographic', 'unknown']);
const ThreadStatus = z.enum(['open', 'awaiting_confirm', 'confirmed', 'refuted']);
const HypothesisStatus = z.enum(['inferred', 'testing', 'confirmed', 'refuted']);
const ContradictionSeverity = z.enum(['minor', 'notable', 'load_bearing']);
const HookSource = z.enum(['pass', 'latency_outlier', 'admission', 'multi_select_pattern', 'inferred']);
const Posture = z.enum(['warm', 'careful', 'direct']);
// NoteCategory + ProfileSectionKey + CastMember Zod schemas dropped
// with the v2 observer rewrite — they belonged to the legacy
// notes_to_append + cast_updates output shape. Phase G's observer
// returns profile_body (markdown) + hooks/edges/side_channel arrays
// + cast_notes_updates + hypothesis_ladder_moves instead.

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
// v2: observer is a psychological profiler with explicit speculation
// authority. Returns a FULL rewrite of profile.body markdown each
// turn, plus updated hooks/edges/side_channel arrays, cast notes,
// and hypothesis ladder moves.

const LadderRung = z.enum(['confirmed', 'probable', 'tentative', 'contested', 'refuted', 'held']);

export const ObserverOutputSchema = z.object({
  profile_body: z.string(),
  hooks: z.array(z.string()),
  edges: z.array(z.string()),
  side_channel: z.object({
    signals: z.string().optional(),
    patterns: z.string().optional(),
    contradictions: z.string().optional(),
    avoidances: z.string().optional(),
  }),
  cast_notes_updates: z.array(z.object({
    label: z.string(),
    notes: z.string(),
  })),
  hypothesis_ladder_moves: z.array(z.object({
    id: z.string(),
    to: LadderRung,
  })),
  reasoning: z.string(),
});

// ─── Detective (combined Detective + Interrogator) ─────
// The detective now does BOTH the investigation update AND the next-question
// pick. Half or more of its response is `private_thoughts`, a freeform
// scratchpad the engine keeps and feeds back on the next call as
// `detective_log`. The next_question subobject is what the old Interrogator
// produced; the rest is what the old Detective produced.

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
  /** Private scratchpad. The model is instructed to spend at least half
   *  the response thinking out loud here — guesses, walks-back, leads,
   *  emotional reads. Persisted to detective_log; fed back on next call. */
  private_thoughts: z.string(),
  /** Compressed synthesis: at most 3 claims, each ≤25 words, that
   *  capture the load-bearing facts about this person right now. This
   *  REPLACES the prior value on each call — the detective sees the
   *  prior and either keeps, edits, or rewrites. Surfaced to the
   *  seer's directorIntro as the spine of the prose_brief. */
  current_understanding: z.array(z.string().max(200)).max(3),
  /** Edits to upcoming queue items. The detective no longer picks
   *  questions — it personalizes them. Each edit references a queue
   *  index (0 = the next question to be asked). Edits to indices
   *  past the sliding window or already-consumed are silently dropped. */
  queue_edits: z.array(z.object({
    index: z.number().int().min(0),
    preamble: z.string().optional(),
    options_override: z.array(z.string()).optional(),
  })).max(8),
  reasoning: z.string(),
});

// ─── Compiler (removed) ─────────────────────────────────
// The compiler stage was dropped in favor of handing off a Seer
// instance directly. The Seer's intro pipeline (cognition → persona)
// runs in its constructor; survey hands off via getSeer() instead of
// producing an intermediate CompilerOutput object.
