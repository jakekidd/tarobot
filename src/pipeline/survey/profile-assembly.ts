// Deterministic mapping from EngineState → legacy Profile. THE bridge.
//
// The Profile shape is frozen (the downstream seam — Seer, Augur,
// director, actor, mantra all read it). This file is the ONLY place
// in the survey module that knows about both the new LivingDoc and
// the legacy Profile shape. Everything else inside the survey deals
// in LivingDoc; everything downstream deals in Profile.
//
// Post-compiler-as-sieve: when state.dilemma is populated (the
// structured DilemmaDocument the compiler emits), assembleProfile
// PREFERS it for the load-bearing fields — candidates, observer_body,
// observer_edges, observer_hooks, side-channel, brief. The legacy
// doc.scaffold path stays as a fallback for null-landing sessions and
// loaded-from-save users whose anchor pre-dates the structured
// Dilemma. This bridge is the load-bearing payoff of the structured
// compiler output: it's where the new fork + critical_hypotheses
// finally reach the Seer's director.

import type {
  CastEntry, Choice, Hunch, Profile, Thread,
} from '../types';
import type { EngineState, CastMember } from './types';
import type { LivingDoc, Probe } from './living-doc';
import type { DilemmaDocument } from './agents/compiler/schema';
import { renderDilemmaAsAnchor } from './agents/compiler/render';

export function assembleProfile(state: EngineState, briefSummary: string): Profile {
  const doc = state.doc;
  const dilemma = state.dilemma;
  // The structured Dilemma is preferred when present + not null-landing.
  // Loaded-from-save users without state.dilemma fall through to the
  // legacy doc.scaffold path (which produces a sparse but valid profile).
  const useDilemma = dilemma !== null && !dilemma.null_landing;

  return {
    identity: {
      name: state.profile.name || undefined,
      birth_date: state.profile.birthday
        ? formatBirthDate(state.profile.birthday)
        : undefined,
      birth_month_day: state.profile.birthday
        ? formatBirthMonthDay(state.profile.birthday)
        : undefined,
      sun_sign: state.profile.sun_sign ?? undefined,
      life_path: state.profile.life_path ?? undefined,
      tarot_birth_card: state.profile.birth_card ?? undefined,
      came_with: undefined,
      notes: collectIdentityNotes(state),
    },
    candidates: useDilemma ? candidatesFromDilemma(dilemma!) : candidatesFromDoc(doc),
    cast: state.profile.cast.map(mapCast),
    threads: [] as Thread[],
    // Hunches: doc.held (algorithmic seeder Probes) — the closing
    // director takes risky swings at these. Critical hypotheses flow
    // through observer_edges instead so the two stay distinct: held
    // probes are "soft priors the seer may surface at the swing,"
    // critical hypotheses are "structural claims the seer holds
    // throughout the reading."
    hunches: doc.held.map(mapHunch),
    margin: doc.margin.join(' · ').slice(0, 480),
    cognition_log: buildCognitionLog(doc, state),
    highlights: doc.story.hooks.map((h, i) => ({
      id: `hook-${i}`,
      topic: h,
      reason: 'story hook',
      introduced_turn: 0,
      ttl: 5,
      salience: 'medium' as const,
    })),
    brief: useDilemma ? buildBriefFromDilemma(dilemma!, briefSummary) : briefSummary,
    observer_body: useDilemma
      ? renderDilemmaAsAnchor(dilemma!)
      : renderScaffoldAsMarkdown(doc),
    observer_hooks: useDilemma
      ? collectVerbatimCorrections(state)
      : doc.story.hooks,
    observer_edges: useDilemma
      ? dilemma!.critical_hypotheses.map((h) => h.claim).slice(0, 8)
      : doc.held.map((p) => p.claim).slice(0, 8),
    observer_side_channel: useDilemma
      ? buildSideChannelFromDilemma(dilemma!)
      : {},
    ready_to_close: useDilemma ? true : isCoverageDone(doc),
    version: doc.v,
  };
}

// ─── derivations from LivingDoc ────────────────────────

/** Render `doc.scaffold` as a single markdown document the Seer's
 *  director can read. Captures leading_hypothesis, axes, cast_notes,
 *  tells, temporal_lean — the structured psychological state.
 *  Phase 2 most of these are empty; the function still emits a
 *  scaffold-only doc that the director gracefully ignores. */
function renderScaffoldAsMarkdown(doc: LivingDoc): string {
  const s = doc.scaffold;
  const out: string[] = ['# Profile', ''];
  if (s.leading_hypothesis) {
    out.push('## leading_hypothesis', '', s.leading_hypothesis, '');
  }
  if (s.temporal_lean) {
    out.push('## stance', '', `temporal_lean: ${s.temporal_lean}`, '');
  }
  const axisKeys = Object.keys(s.axes);
  if (axisKeys.length > 0) {
    out.push('## axes', '');
    for (const k of axisKeys) {
      out.push(`### ${k}`, '', s.axes[k] ?? '', '');
    }
  }
  const castKeys = Object.keys(s.cast_notes);
  if (castKeys.length > 0) {
    out.push('## cast_notes', '');
    for (const k of castKeys) {
      out.push(`- ${k}: ${s.cast_notes[k] ?? ''}`);
    }
    out.push('');
  }
  if (s.tells.length > 0) {
    out.push('## tells', '', ...s.tells.map((t) => `- ${t}`), '');
  }
  if (doc.margin.length > 0) {
    out.push('## margin', '', ...doc.margin.map((m) => `- ${m}`), '');
  }
  return out.join('\n');
}

/** Build the Profile.candidates array from doc.scaffold. The Seer's
 *  director reads this to find the target fork (which it then names
 *  the cards around). In v2 we derive a single Choice from
 *  leading_hypothesis + fork. Empty leading_hypothesis → empty
 *  candidates (director tolerates). */
function candidatesFromDoc(doc: LivingDoc): Choice[] {
  if (!doc.scaffold.fork && !doc.scaffold.leading_hypothesis) return [];
  const fork = doc.scaffold.fork;
  return [{
    id: 'doc-leading',
    description: doc.scaffold.leading_hypothesis || (fork ? `${fork.a} vs ${fork.b}` : '(unnamed)'),
    options: fork
      ? [
          { name: fork.a, summary: '' },
          { name: fork.b, summary: '' },
        ]
      : [],
    source: fork?.is_stasis ? 'constructed' : 'stated',
    scores: {
      stakes: 3,
      time_proximity: 3,
      user_engagement: 3,
    },
    is_target: true,
    confidence: doc.scaffold.leading_hypothesis ? 0.6 : 0.3,
    notes: '',
  }];
}

function mapCast(c: CastMember): CastEntry {
  return {
    role: c.likely_role ?? c.label,
    name: undefined,
    valence: c.confidence === 'high'
      ? 'high-confidence anchor'
      : c.confidence === 'medium' ? 'probable' : 'speculative',
    last_referenced_turn: 0,
  };
}

function mapHunch(p: Probe): Hunch {
  return {
    suspicion: p.claim,
    grounded_in: `${p.source} · ${p.age_in_turns} turns held`,
    confidence: 0.3,
    age_turns: p.age_in_turns,
  };
}

// ─── DilemmaDocument adapters ────────────────────────────

/** Build a Choice array from the structured Dilemma. The Seer's
 *  director reads candidates[0] as the target fork and names the
 *  cards around it. */
function candidatesFromDilemma(d: DilemmaDocument): Choice[] {
  const confMap = { low: 0.4, medium: 0.65, high: 0.85 } as const;
  const stakesMap = { low: 2, medium: 3, high: 4 } as const;
  return [{
    id: `dilemma-${d.label}`,
    description: d.delta_description,
    options: [
      { name: 'continue as you are', summary: d.fork.do_nothing_branch },
      { name: 'the alternative', summary: d.fork.alternative_branch },
    ],
    source: d.resolution_path === 'created-from-intent' ? 'stated' : 'constructed',
    scores: {
      stakes: stakesMap[d.confidence],
      time_proximity: 3,        // unknown — neutral. real time-pressure isn't in the schema.
      user_engagement: 3,       // ditto.
    },
    is_target: true,
    confidence: confMap[d.confidence],
    notes: [
      `domains: ${d.domain_tags.join(', ') || '∅'}`,
      `awareness: ${d.awareness}`,
      `resolution: ${d.resolution_path}`,
    ].join(' · '),
  }];
}

/** Synthesize the Profile.brief from the Dilemma's delta_description
 *  + a thin texture pass from `holding`. brief is the only thing the
 *  actor reads about who this person is, so keep it natural-prose,
 *  not list-shaped. */
function buildBriefFromDilemma(d: DilemmaDocument, fallback: string): string {
  const parts = [d.delta_description.trim()];
  if (d.holding && d.holding.trim().length > 0) {
    parts.push(d.holding.trim());
  }
  const joined = parts.join(' ').slice(0, 480);
  return joined || fallback;
}

/** observer_hooks: the verbatim phrases the seer can echo. Pulled
 *  directly from the user's correction texts (the gold signal —
 *  what they typed in their own words after a WARM/COLD pick). */
function collectVerbatimCorrections(state: EngineState): string[] {
  return state.verbatim_log
    .filter((v) => v.source === 'correction' && v.text.trim().length > 0)
    .map((v) => v.text);
}

/** Map Dilemma freeform regions into the Profile.observer_side_channel
 *  shape. Patterns ← holding (stance + texture). Avoidances ←
 *  suspicions (fenced — director may steer toward, actor must not
 *  voice). The cop-sheet failure mode lives or dies on whether
 *  downstream respects the fence on `avoidances` specifically. */
function buildSideChannelFromDilemma(d: DilemmaDocument) {
  return {
    ...(d.holding.trim().length > 0 ? { patterns: d.holding.trim() } : {}),
    ...(d.suspicions.trim().length > 0 ? { avoidances: d.suspicions.trim() } : {}),
  };
}

// ─── builders ───────────────────────────────────────────

function collectIdentityNotes(state: EngineState): string {
  const parts: string[] = [];
  const id = state.profile;
  if (id.birth_time_bracket && id.birth_time_bracket !== 'unknown') {
    parts.push(`birth time: ${id.birth_time_bracket}`);
  }
  if (id.initial_intention) {
    parts.push(`initial intention: ${id.initial_intention}`);
  } else {
    parts.push('came without an intention');
  }
  if (state.is_returning_user) {
    parts.push('returning user');
  }
  if (id.age_bracket) {
    parts.push(`age bracket: ${id.age_bracket}`);
  }
  return parts.join('. ');
}

function buildCognitionLog(doc: LivingDoc, state: EngineState): string {
  const s = doc.scaffold;
  const d = state.dilemma;
  const compact = {
    // Dilemma summary (compiler-as-sieve output) — the load-bearing
    // structural read the seer's director uses. Surfaced near the top
    // of cognition_log so debug eyeballing is direct.
    dilemma: d
      ? {
          label: d.label,
          resolution_path: d.resolution_path,
          confidence: d.confidence,
          awareness: d.awareness,
          domains: d.domain_tags,
          null_landing: d.null_landing,
          critical_hyp_count: d.critical_hypotheses.length,
        }
      : null,
    leading_hypothesis: s.leading_hypothesis || null,
    temporal_lean: s.temporal_lean,
    fork: s.fork,
    axes: Object.keys(s.axes),
    tells: s.tells.slice(-6),
    held_count: doc.held.length,
    weaver_candidate_count: state.weaver_candidates.length,
    weaver_runs: state.weaver_run_count,
    close_reason: state.close_reason ?? null,
    questions_answered: state.picks_log.length,
  };
  return JSON.stringify(compact).slice(0, 1900);
}

/** Coverage "done" predicate for ready_to_close. In Phase 2 the
 *  coverage map is empty (no recompute yet), so this is effectively
 *  false. Phase 3 wires a real heuristic; Phase 5 calibrates against
 *  the ≥80% fork-named target. */
function isCoverageDone(doc: LivingDoc): boolean {
  if (doc.scaffold.fork === null) return false;
  if (doc.scaffold.temporal_lean === null) return false;
  if (doc.margin.length < 3) return false;
  return true;
}

// ─── helpers ────────────────────────────────────────────

function formatBirthDate(b: { year: number; month: number; day: number }): string {
  return `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}
function formatBirthMonthDay(b: { year: number; month: number; day: number }): string {
  return `${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}
