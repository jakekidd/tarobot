// Apply-path tests. These are the pure helpers the engine uses to
// merge observer / detective output into engine state. Critical for
// the v2 refactor — the shape of the state mutations is what every
// downstream agent reads.

import { describe, expect, it } from 'vitest';
import type {
  CastMember,
  Hypothesis,
  HypothesisLadder,
  Investigation,
  ObserverOutput,
  StoryObject,
  SurveyProfile,
  DetectiveOutput,
} from '../src/pipeline/survey/types';
import { probeToString } from '../src/pipeline/survey/types';

// Re-import the internal apply functions through the engine file —
// they aren't exported. We test them by constructing an engine state
// and asserting the after-shape. Or — since the engine is the only
// caller — we expose them via a test-only re-export.
//
// Cleaner approach: import the engine and assert via its public API
// (subscribe to state changes after submitAnswer). But for the apply
// helpers specifically, that introduces too many moving parts. We'll
// re-export the helpers as a barrel for testing.

import {
  __test_applyObserverOutput,
  __test_applyDetectiveOutput,
  __test_applyLadderMoves,
  __test_addNewHypotheses,
  __test_mergeStoryUpdates,
  __test_removeFromLadder,
} from '../src/pipeline/survey/engine';

// ─── fixtures ──────────────────────────────────────────────

function emptyLadder(): HypothesisLadder {
  return { confirmed: [], probable: [], tentative: [], contested: [], refuted: [], held: [] };
}

function emptyStory(): StoryObject {
  return { fork: null, present_pressure: null, past_root: null, stakes: null, hooks: [] };
}

function emptyInvestigation(): Investigation {
  return {
    hypotheses: emptyLadder(),
    story: emptyStory(),
    choice_draft: null,
    contradictions: [],
    hooks: [],
    active_threads: [],
    posture: null,
  };
}

function emptyProfile(): SurveyProfile {
  return {
    name: 'jane',
    birthday: null,
    sun_sign: null,
    life_path: null,
    birth_card: null,
    age_bracket: null,
    birth_time_bracket: null,
    relationship_status: null,
    initial_intention: null,
    sections: { identity: [], state: [], relational: [], self_model: [], decision_context: [], patterns: [] },
    body: '# Profile\n\n<!-- scaffold -->\n',
    hooks: [],
    edges: [],
    side_channel: {},
    cast: [],
  };
}

function hyp(id: string, status: Hypothesis['status'] = 'inferred', confidence = 0.5): Hypothesis {
  return {
    id,
    description: `claim:${id}`,
    supporting_picks: [],
    contradicting_picks: [],
    confidence,
    status,
  };
}

// ─── applyObserverOutput ───────────────────────────────────

// A body that passes the shape guard — all 9 required ## headers present.
const FULL_BODY = [
  '# Profile',
  '## self',
  'she is a careful planner.',
  '## history',
  '## relationships',
  '## joys',
  '## fears',
  '## insecurities',
  '## yearnings',
  '## now',
  '## tensions',
].join('\n\n');

describe('applyObserverOutput', () => {
  it('REPLACES profile.body with new body (when shape guard passes)', () => {
    const profile = emptyProfile();
    const out: ObserverOutput = {
      profile_body: FULL_BODY,
      hooks: [],
      edges: [],
      side_channel: {},
      cast_notes_updates: [],
      hypothesis_ladder_moves: [],
      reasoning: '',
    };
    const next = __test_applyObserverOutput(profile, out);
    expect(next.body).toContain('she is a careful planner');
    expect(next.body).not.toBe(profile.body);  // not the original scaffold
  });

  it('FALLS BACK to prior body when emitted body is missing required ## sections', () => {
    // Distinct prior body so the assertion proves we kept it, not the broken one.
    const priorBody = [
      '# Profile',
      'PRIOR-MARKER',
      '## self', '## history', '## relationships', '## joys',
      '## fears', '## insecurities', '## yearnings', '## now', '## tensions',
    ].join('\n\n');
    const profile = { ...emptyProfile(), body: priorBody };
    // Emit body that drops ## tensions and ## now — broken scaffold.
    const broken = [
      '# Profile',
      'BROKEN-MARKER',
      '## self', '## history', '## relationships', '## joys',
      '## fears', '## insecurities', '## yearnings',
      // ## now and ## tensions missing
    ].join('\n\n');
    const out: ObserverOutput = {
      profile_body: broken,
      hooks: [],
      edges: [],
      side_channel: {},
      cast_notes_updates: [],
      hypothesis_ladder_moves: [],
      reasoning: '',
    };
    const next = __test_applyObserverOutput(profile, out);
    expect(next.body).toBe(priorBody);          // kept the prior shape-correct body
    expect(next.body).toContain('PRIOR-MARKER');
    expect(next.body).not.toContain('BROKEN-MARKER');
  });

  it('REPLACES hooks / edges / side_channel arrays (no merge)', () => {
    const profile = { ...emptyProfile(), hooks: ['old hook'], edges: ['old edge'] };
    const out: ObserverOutput = {
      profile_body: profile.body,
      hooks: ['new hook'],
      edges: ['new edge 1', 'new edge 2'],
      side_channel: { signals: 'long latency on Q4' },
      cast_notes_updates: [],
      hypothesis_ladder_moves: [],
      reasoning: '',
    };
    const next = __test_applyObserverOutput(profile, out);
    expect(next.hooks).toEqual(['new hook']);
    expect(next.edges).toEqual(['new edge 1', 'new edge 2']);
    expect(next.side_channel.signals).toBe('long latency on Q4');
  });

  it('MERGES cast notes by label (only updates matched CastMembers)', () => {
    const cast: CastMember[] = [
      { label: 'Mom', supporting_picks: [], confidence: 'high', notes: 'old' },
      { label: 'Sam', supporting_picks: [], confidence: 'medium' },
    ];
    const profile = { ...emptyProfile(), cast };
    const out: ObserverOutput = {
      profile_body: profile.body,
      hooks: [],
      edges: [],
      side_channel: {},
      cast_notes_updates: [
        { label: 'Mom', notes: 'updated note' },
      ],
      hypothesis_ladder_moves: [],
      reasoning: '',
    };
    const next = __test_applyObserverOutput(profile, out);
    expect(next.cast[0]!.notes).toBe('updated note');
    expect(next.cast[1]!.notes).toBeUndefined();  // Sam unchanged
  });

  it('IGNORES cast_notes_updates for unknown labels (no fabricated members)', () => {
    const profile = emptyProfile();
    const out: ObserverOutput = {
      profile_body: profile.body,
      hooks: [],
      edges: [],
      side_channel: {},
      cast_notes_updates: [{ label: 'Bob', notes: 'a note about bob' }],
      hypothesis_ladder_moves: [],
      reasoning: '',
    };
    const next = __test_applyObserverOutput(profile, out);
    expect(next.cast).toHaveLength(0);  // no cast added
  });
});

// ─── applyLadderMoves ──────────────────────────────────────

describe('applyLadderMoves', () => {
  it('moves a hypothesis from tentative to confirmed', () => {
    const ladder: HypothesisLadder = {
      ...emptyLadder(),
      tentative: [hyp('h1')],
    };
    const next = __test_applyLadderMoves(ladder, [{ id: 'h1', to: 'confirmed' }]);
    expect(next.tentative).toHaveLength(0);
    expect(next.confirmed).toHaveLength(1);
    expect(next.confirmed[0]!.id).toBe('h1');
  });

  it('moves a hypothesis from probable to contested', () => {
    const ladder: HypothesisLadder = {
      ...emptyLadder(),
      probable: [hyp('h2')],
    };
    const next = __test_applyLadderMoves(ladder, [{ id: 'h2', to: 'contested' }]);
    expect(next.probable).toHaveLength(0);
    expect(next.contested).toHaveLength(1);
  });

  it('silently drops moves for unknown ids', () => {
    const ladder = emptyLadder();
    const next = __test_applyLadderMoves(ladder, [{ id: 'nope', to: 'confirmed' }]);
    expect(next).toEqual(ladder);  // unchanged
  });

  it('processes multiple moves in sequence', () => {
    const ladder: HypothesisLadder = {
      ...emptyLadder(),
      tentative: [hyp('a'), hyp('b'), hyp('c')],
    };
    const next = __test_applyLadderMoves(ladder, [
      { id: 'a', to: 'confirmed' },
      { id: 'b', to: 'refuted' },
    ]);
    expect(next.tentative.map((h) => h.id)).toEqual(['c']);
    expect(next.confirmed.map((h) => h.id)).toEqual(['a']);
    expect(next.refuted.map((h) => h.id)).toEqual(['b']);
  });

  it('returns the original ladder when moves is empty', () => {
    const ladder = emptyLadder();
    expect(__test_applyLadderMoves(ladder, [])).toBe(ladder);
  });
});

// ─── addNewHypotheses ──────────────────────────────────────

describe('addNewHypotheses', () => {
  it('adds a new hypothesis to tentative by default', () => {
    const ladder = emptyLadder();
    const next = __test_addNewHypotheses(ladder, [{ id: 'x', claim: 'a guess' }]);
    expect(next.tentative).toHaveLength(1);
    expect(next.tentative[0]!.description).toBe('a guess');
    expect(next.tentative[0]!.seeded).toBe(false);
  });

  it('respects start_at when specified', () => {
    const ladder = emptyLadder();
    const next = __test_addNewHypotheses(ladder, [
      { id: 'a', claim: 'confirmed claim', start_at: 'confirmed' },
      { id: 'b', claim: 'contested claim', start_at: 'contested' },
    ]);
    expect(next.confirmed.map((h) => h.id)).toEqual(['a']);
    expect(next.contested.map((h) => h.id)).toEqual(['b']);
  });

  it('upserts existing id — updates description, preserves no-collision', () => {
    const ladder: HypothesisLadder = {
      ...emptyLadder(),
      tentative: [hyp('x')],
    };
    const next = __test_addNewHypotheses(ladder, [{ id: 'x', claim: 'rewritten claim' }]);
    expect(next.tentative).toHaveLength(1);
    expect(next.tentative[0]!.description).toBe('rewritten claim');
  });

  it('upsert moves existing id to the specified rung', () => {
    const ladder: HypothesisLadder = {
      ...emptyLadder(),
      tentative: [hyp('x')],
    };
    const next = __test_addNewHypotheses(ladder, [
      { id: 'x', claim: 'upgraded', start_at: 'confirmed' },
    ]);
    expect(next.tentative).toHaveLength(0);
    expect(next.confirmed).toHaveLength(1);
  });
});

// ─── mergeStoryUpdates ─────────────────────────────────────

describe('mergeStoryUpdates', () => {
  it('replaces fork when fork update provided', () => {
    const story = emptyStory();
    const next = __test_mergeStoryUpdates(story, {
      fork: { a: 'leave', b: 'stay', is_stasis: false },
    });
    expect(next.fork).toEqual({ a: 'leave', b: 'stay', is_stasis: false });
  });

  it('replaces present_pressure / past_root / stakes when provided', () => {
    const story = emptyStory();
    const next = __test_mergeStoryUpdates(story, {
      present_pressure: 'mom is sick',
      past_root: 'left home at 17',
      stakes: { on_a: 'lose family', on_b: 'lose self' },
    });
    expect(next.present_pressure).toBe('mom is sick');
    expect(next.past_root).toBe('left home at 17');
    expect(next.stakes).toEqual({ on_a: 'lose family', on_b: 'lose self' });
  });

  it('preserves existing fields when update omits them', () => {
    const story: StoryObject = {
      fork: { a: 'x', b: 'y', is_stasis: false },
      present_pressure: 'orig pressure',
      past_root: 'orig root',
      stakes: null,
      hooks: [],
    };
    const next = __test_mergeStoryUpdates(story, { present_pressure: 'new pressure' });
    expect(next.fork).toEqual(story.fork);
    expect(next.past_root).toBe('orig root');
    expect(next.present_pressure).toBe('new pressure');
  });

  it('APPENDS + dedupes hooks (not replace)', () => {
    const story = { ...emptyStory(), hooks: ['old hook'] };
    const next = __test_mergeStoryUpdates(story, { hooks: ['new hook', 'old hook'] });
    expect(next.hooks).toEqual(['old hook', 'new hook']);  // dedupe; original first
  });

  it('returns same story when update is empty', () => {
    const story = emptyStory();
    const next = __test_mergeStoryUpdates(story, {});
    expect(next).toEqual(story);
  });
});

// ─── applyDetectiveOutput ──────────────────────────────────

describe('applyDetectiveOutput', () => {
  it('adds new hypotheses to ladder + applies ladder moves + merges story', () => {
    const inv = emptyInvestigation();
    const out: DetectiveOutput = {
      new_hypotheses: [{ id: 'h1', claim: 'first claim' }],
      hypothesis_ladder_moves: [],
      story_updates: {
        fork: { a: 'leave', b: 'stay', is_stasis: false },
        hooks: ['a hook'],
      },
      private_thoughts: 'thinking out loud',
      reasoning: 'reasoning',
    };
    const next = __test_applyDetectiveOutput(inv, out);
    expect(next.hypotheses.tentative[0]!.description).toBe('first claim');
    expect(next.story.fork).toEqual({ a: 'leave', b: 'stay', is_stasis: false });
    expect(next.story.hooks).toEqual(['a hook']);
  });

  it('adds then immediately moves a hypothesis in the same turn', () => {
    const inv = emptyInvestigation();
    const out: DetectiveOutput = {
      new_hypotheses: [{ id: 'h1', claim: 'a' }],  // lands tentative
      hypothesis_ladder_moves: [{ id: 'h1', to: 'confirmed' }],  // moves up same turn
      story_updates: {},
      private_thoughts: '',
      reasoning: '',
    };
    const next = __test_applyDetectiveOutput(inv, out);
    expect(next.hypotheses.tentative).toHaveLength(0);
    expect(next.hypotheses.confirmed).toHaveLength(1);
  });
});

// ─── removeFromLadder ──────────────────────────────────────

describe('removeFromLadder', () => {
  it('removes the id from whichever rung it sits on', () => {
    const ladder: HypothesisLadder = {
      ...emptyLadder(),
      confirmed: [hyp('a'), hyp('b')],
      tentative: [hyp('c')],
    };
    const next = __test_removeFromLadder(ladder, 'b');
    expect(next.confirmed.map((h) => h.id)).toEqual(['a']);
    expect(next.tentative.map((h) => h.id)).toEqual(['c']);
  });

  it('is a no-op for unknown ids', () => {
    const ladder: HypothesisLadder = {
      ...emptyLadder(),
      confirmed: [hyp('a')],
    };
    const next = __test_removeFromLadder(ladder, 'nope');
    expect(next.confirmed).toHaveLength(1);
  });
});

// ─── probeToString ─────────────────────────────────────────

describe('probeToString', () => {
  it('returns undefined for undefined probe', () => {
    expect(probeToString(undefined)).toBeUndefined();
  });

  it('returns undefined for empty probe object', () => {
    expect(probeToString({})).toBeUndefined();
  });

  it('formats surface only', () => {
    expect(probeToString({ surface: 'a surface note' })).toBe('surface: a surface note');
  });

  it('joins all three fields with newlines', () => {
    const s = probeToString({
      surface: 'what literal',
      inversions: 'what inverts',
      watch_for: 'what to check',
    });
    expect(s).toContain('surface: what literal');
    expect(s).toContain('inversions: what inverts');
    expect(s).toContain('watch for: what to check');
    expect(s!.split('\n')).toHaveLength(3);
  });
});
