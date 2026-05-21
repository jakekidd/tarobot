// Deterministic mapping from EngineState → legacy Profile. THE bridge.
//
// The Profile shape is frozen (the downstream seam — Seer, Augur,
// director, actor, mantra all read it). This file is the ONLY place
// in the survey module that knows about both the new LivingDoc and
// the legacy Profile shape. Everything else inside the survey deals
// in LivingDoc; everything downstream deals in Profile.
//
// Phase 2 status: doc is largely empty at assembly time because the
// observer + detective agents throw not_implemented_v2. The bridge
// still produces a valid Profile — just with empty/minimal cognition
// fields. The Seer's director / Augur tolerate empty arrays so the
// reading degrades to "raw identity + opener answers" but doesn't
// crash. Phase 3 lights up the real doc content.

import type {
  CastEntry, Choice, Hunch, Profile, Thread,
} from '../types';
import type { EngineState, CastMember } from './types';
import type { LivingDoc, Probe } from './living-doc';

export function assembleProfile(state: EngineState, briefSummary: string): Profile {
  const doc = state.doc;
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
    candidates: candidatesFromDoc(doc),
    cast: state.profile.cast.map(mapCast),
    // Director.ts handles empty arrays gracefully. Threads as a
    // cross-cutting pattern type isn't reconstructed from doc;
    // similar information surfaces through doc.scaffold.axes and
    // leading_hypothesis (which feed observer_body).
    threads: [] as Thread[],
    // Hunches map 1-to-1 from doc.held — each unresolved probe is a
    // "suspicion the survey didn't settle". Director uses them as
    // texture for the closing risky-swing.
    hunches: doc.held.map(mapHunch),
    margin: doc.margin.join(' · ').slice(0, 480),
    cognition_log: buildCognitionLog(doc, state),
    // Highlights derive from doc.story.hooks (verbatim specifics).
    // Phase 4's is_engine_authored guard prevents planted-option
    // text from leaking in here.
    highlights: doc.story.hooks.map((h, i) => ({
      id: `hook-${i}`,
      topic: h,
      reason: 'story hook',
      introduced_turn: 0,
      ttl: 5,
      salience: 'medium' as const,
    })),
    brief: briefSummary,
    // Observer-produced texture — Phase 3 fills these. In Phase 2 the
    // observer throws so these are minimal; the body is a rendering of
    // whatever scaffold content survived. Empty scaffold → empty body.
    observer_body: renderScaffoldAsMarkdown(doc),
    observer_hooks: doc.story.hooks,
    observer_edges: doc.held.map((p) => p.claim).slice(0, 8),
    observer_side_channel: {},     // Phase 3 derives from doc.scaffold.tells + algoExtract
    ready_to_close: isCoverageDone(doc),
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
  const compact = {
    leading_hypothesis: s.leading_hypothesis || null,
    temporal_lean: s.temporal_lean,
    fork: s.fork,
    axes: Object.keys(s.axes),
    tells: s.tells.slice(-6),
    held_count: doc.held.length,
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
