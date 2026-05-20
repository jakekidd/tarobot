// Deterministic mapping from EngineState → legacy Profile. The Compiler LLM
// produces ONLY synthesis fields (brief, openers, prose_brief); everything
// else in the Profile is built here from the engine's own data. This dramatically
// reduces the LLM surface area and makes Compiler failures recoverable.

import type {
  CastEntry, Choice, Highlight, Hunch, Profile, Thread,
} from '../types';
import type {
  EngineState, CastMember, Hook, Hypothesis, HypothesisLadder, ActiveThread, Note,
  Choice as SurveyChoice,
} from './types';

/** Flatten the hypothesis ladder into a single array for legacy
 *  Profile.hunches consumption. Order: confirmed → probable →
 *  contested → tentative → held → refuted (most-believed first;
 *  refuted last). Phase I rewires the seer handoff to take the
 *  ladder directly. */
function flattenLadder(l: HypothesisLadder): Hypothesis[] {
  return [
    ...l.confirmed,
    ...l.probable,
    ...l.contested,
    ...l.tentative,
    ...l.held,
    ...l.refuted,
  ];
}

export function assembleProfile(state: EngineState, briefSummary: string): Profile {
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
      came_with: undefined,        // not asked in v0.4.0 openers
      notes: collectIdentityNotes(state),
    },
    candidates: mapCandidates(state.investigation.choice_draft),
    cast: state.profile.cast.map(mapCast),
    threads: state.investigation.active_threads.map(mapThread),
    // Hypothesis ladder → hunches: flatten all rungs (transitional;
    // Phase I rewires the seer handoff to take the ladder directly
    // along with the StoryObject).
    hunches: flattenLadder(state.investigation.hypotheses).map(mapHunch),
    margin: buildMargin(state),
    cognition_log: buildCognitionLog(state),
    highlights: state.investigation.hooks.map((h, idx) => mapHighlight(h, idx)),
    brief: briefSummary,
    // Observer-produced texture forwarded to the seer. These were
    // computed but going nowhere before — the director payloads now
    // include them so the seer reads who the subject IS, not just the
    // structural fork they stand at.
    observer_body: state.profile.body,
    observer_hooks: state.profile.hooks,
    observer_edges: state.profile.edges,
    observer_side_channel: state.profile.side_channel,
    ready_to_close: (state.investigation.choice_draft?.confidence ?? 'low') !== 'low',
    version: 1,
  };
}

// ─── mappers ────────────────────────────────────────────────

function mapCandidates(choice: SurveyChoice | null): Choice[] {
  if (!choice) return [];
  // Score the dimensions from confidence + stakes heuristics; the seer can
  // read these but doesn't strictly depend on them being precise.
  const scoreFromConfidence: Record<SurveyChoice['confidence'], number> = {
    low: 2, medium: 3, high: 4,
  };
  const score = scoreFromConfidence[choice.confidence];
  return [{
    id: 'survey-choice-1',
    description: choice.fork,
    options: [
      { name: choice.fork_a.label, summary: choice.fork_a.supporting_picks.join(' · ') },
      { name: choice.fork_b.label, summary: choice.fork_b.supporting_picks.join(' · ') },
    ],
    source: choice.is_stated ? 'stated' : 'constructed',
    scores: {
      stakes: score,
      time_proximity: score,
      user_engagement: score,
    },
    is_target: true,
    confidence: choice.confidence === 'high' ? 0.85 : choice.confidence === 'medium' ? 0.6 : 0.35,
    notes: choice.open_questions.join(' · '),
  }];
}

function mapCast(c: CastMember): CastEntry {
  return {
    role: c.likely_role ?? c.label,
    name: c.label.startsWith('unnamed') ? undefined : undefined,   // labels are placeholders
    valence: c.confidence === 'high' ? 'high-confidence anchor' : c.confidence === 'medium' ? 'probable' : 'speculative',
    last_referenced_turn: 0,
  };
}

function mapThread(t: ActiveThread): Thread {
  return {
    pattern: `${t.description}${t.observer_note ? ' — ' + t.observer_note : ''} (${t.status})`,
    observations: [],            // engine doesn't track turn indices for threads
    salience:
      t.status === 'confirmed' ? 4 :
      t.status === 'awaiting_confirm' ? 3 :
      t.status === 'open' ? 2 : 1,
  };
}

function mapHunch(h: Hypothesis): Hunch {
  return {
    suspicion: h.description,
    grounded_in: h.supporting_picks.join(' · ') || '(no specific picks)',
    confidence: h.confidence,
    age_turns: 0,
  };
}

function mapHighlight(h: Hook, idx: number): Highlight {
  return {
    id: `hook-${idx}`,
    topic: h.description,
    reason: `from ${h.source}${h.source_pick ? ' on ' + h.source_pick : ''}`,
    introduced_turn: 0,
    ttl: 5,
    salience: h.source === 'admission' || h.source === 'pass' ? 'high' : 'medium',
  };
}

// ─── builders ───────────────────────────────────────────────

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
  for (const n of state.profile.sections.identity) {
    parts.push(n.text);
  }
  return parts.join('. ');
}

function buildMargin(state: EngineState): string {
  // Compressed observations across all profile sections. Keep under ~500 chars.
  const all: Note[] = [
    ...state.profile.sections.state,
    ...state.profile.sections.relational,
    ...state.profile.sections.self_model,
    ...state.profile.sections.decision_context,
    ...state.profile.sections.patterns,
  ];
  const lines = all
    .filter((n) => n.category === 'observation' || n.category === 'suspicion')
    .map((n) => `• ${n.text}`);
  return truncate(lines.join('\n'), 480);
}

function buildCognitionLog(state: EngineState): string {
  const parts: string[] = [];
  const inv = state.investigation;
  if (inv.choice_draft) {
    parts.push(`Choice (${inv.choice_draft.confidence}, ${inv.choice_draft.is_stated ? 'stated' : 'constructed'}): ${inv.choice_draft.fork}`);
  }
  if (inv.contradictions.length > 0) {
    parts.push('Contradictions:');
    for (const c of inv.contradictions) {
      parts.push(`  - [${c.severity}] ${c.description}`);
    }
  }
  if (inv.posture) {
    parts.push(`Posture: ${inv.posture}`);
  }
  parts.push(`Closed on ${state.close_reason} at Q${state.picks_log.length}.`);
  return truncate(parts.join('\n'), 1900);
}

// ─── helpers ────────────────────────────────────────────────

function formatBirthDate(b: { year: number; month: number; day: number }): string {
  return `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}
function formatBirthMonthDay(b: { year: number; month: number; day: number }): string {
  return `${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}
function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
