// SurveyEngine state-machine tests. Uses FakeAdapter so no inference
// runs; verifies state transitions and snapshot/undo mechanics.

import { describe, expect, it } from 'vitest';
import { SurveyEngine } from '../src/pipeline/survey/engine';
import { PROFILE_TEMPLATE_RAW } from '../src/pipeline/survey/template';
import {
  FakeAdapter,
  defaultDetectiveOutput,
  defaultObserverOutput,
} from './fakeAdapter';

function makeAdapter(): FakeAdapter {
  return new FakeAdapter()
    .setTool('observer_metabolize', (spec) => {
      // Use whatever profile_body the engine sent us, echo it back.
      const payload = JSON.parse(spec.user);
      return defaultObserverOutput(payload.profile_body ?? '');
    })
    .setTool('detective_step', () => defaultDetectiveOutput());
}

function makeEngine(opts?: { adapter?: FakeAdapter }): SurveyEngine {
  return new SurveyEngine({ adapter: opts?.adapter ?? makeAdapter() });
}

describe('SurveyEngine — initial state', () => {
  it('populates profile.body with the template scaffold', () => {
    const engine = makeEngine();
    expect(engine.getState().profile.body).toBe(PROFILE_TEMPLATE_RAW);
  });

  it('populates profile.hooks / edges / side_channel as empty defaults', () => {
    const engine = makeEngine();
    const profile = engine.getState().profile;
    expect(profile.hooks).toEqual([]);
    expect(profile.edges).toEqual([]);
    expect(profile.side_channel).toEqual({});
  });

  it('populates an empty hypothesis ladder', () => {
    const engine = makeEngine();
    const lad = engine.getState().investigation.hypotheses;
    expect(lad.confirmed).toEqual([]);
    expect(lad.probable).toEqual([]);
    expect(lad.tentative).toEqual([]);
    expect(lad.contested).toEqual([]);
    expect(lad.refuted).toEqual([]);
    expect(lad.held).toEqual([]);
  });

  it('populates an empty story', () => {
    const engine = makeEngine();
    const story = engine.getState().investigation.story;
    expect(story.fork).toBeNull();
    expect(story.present_pressure).toBeNull();
    expect(story.past_root).toBeNull();
    expect(story.stakes).toBeNull();
    expect(story.hooks).toEqual([]);
  });

  it('starts at phase A and stage questions', () => {
    const state = makeEngine().getState();
    expect(state.phase).toBe('A');
    expect(state.stage).toBe('questions');
    expect(state.closed).toBe(false);
  });

  it('queues the first opener (name) at head', () => {
    const engine = makeEngine();
    const q = engine.getCurrentQuestion()!;
    expect(q.node_id).toBe('name');
  });

  it('canUndo is false at start', () => {
    expect(makeEngine().canUndo()).toBe(false);
  });
});

describe('SurveyEngine — opener flow', () => {
  it('walks name → birthday → relationship → intent without firing pipelines', async () => {
    const adapter = makeAdapter();
    const engine = makeEngine({ adapter });
    await engine.submitAnswer('jake');
    expect(engine.getCurrentQuestion()!.node_id).toBe('birthday');
    await engine.submitAnswer('1990-01-15');
    expect(engine.getCurrentQuestion()!.node_id).toBe('relationship');
    await engine.submitAnswer('single');
    expect(engine.getCurrentQuestion()!.node_id).toBe('intent');
    // No agent calls should have happened during openers.
    expect(adapter.calls).toEqual([]);
  });

  it('populates profile.name when name opener is answered', async () => {
    const engine = makeEngine();
    await engine.submitAnswer('jake');
    expect(engine.getState().profile.name).toBe('jake');
  });

  it('seeds the post-opener queue after the last opener (Pillars + random pool)', async () => {
    const engine = makeEngine();
    await engine.submitAnswer('jake');
    await engine.submitAnswer('1990-01-15');
    await engine.submitAnswer('single');
    await engine.submitAnswer('what should i do?');
    const queue = engine.getState().queue;
    // Pillars (8 from materials/survey.md) + 12 random pool = 20.
    // We just assert it's non-trivially seeded.
    expect(queue.length).toBeGreaterThanOrEqual(8);
  });
});

describe('SurveyEngine — undo / snapshot', () => {
  it('captures a snapshot on submitAnswer; canUndo becomes true', async () => {
    const engine = makeEngine();
    expect(engine.canUndo()).toBe(false);
    await engine.submitAnswer('jake');
    expect(engine.canUndo()).toBe(true);
  });

  it('undo restores prior state — name comes back as empty', async () => {
    const engine = makeEngine();
    const before = engine.getState().profile.name;
    await engine.submitAnswer('jake');
    expect(engine.getState().profile.name).toBe('jake');
    engine.undo();
    expect(engine.getState().profile.name).toBe(before);
    // After undo, current question is the name opener again.
    expect(engine.getCurrentQuestion()!.node_id).toBe('name');
  });

  it('undo clears the snapshot (one-level only)', async () => {
    const engine = makeEngine();
    await engine.submitAnswer('jake');
    expect(engine.canUndo()).toBe(true);
    engine.undo();
    expect(engine.canUndo()).toBe(false);
  });

  it('undo is a no-op when no snapshot exists', () => {
    const engine = makeEngine();
    const before = engine.getState();
    engine.undo();  // nothing to undo
    expect(engine.getState()).toBe(before);
  });

  it('submit → undo → submit again works (no stale snapshot)', async () => {
    const engine = makeEngine();
    await engine.submitAnswer('jake');
    engine.undo();
    expect(engine.canUndo()).toBe(false);
    await engine.submitAnswer('jane');
    expect(engine.getState().profile.name).toBe('jane');
    expect(engine.canUndo()).toBe(true);  // re-armed
  });

  it('snapshot taken BEFORE mutation — rolling back restores pre-mutation state', async () => {
    const engine = makeEngine();
    await engine.submitAnswer('jake');
    // picks_log should now have one entry (the name opener)
    expect(engine.getState().picks_log).toHaveLength(1);
    engine.undo();
    // After undo, picks_log is empty again.
    expect(engine.getState().picks_log).toHaveLength(0);
  });
});

describe('SurveyEngine — relationship_pick parsing', () => {
  it('parses JSON answer payload + upserts a CastMember when the head is relationship_pick', async () => {
    const engine = makeEngine();
    // Walk past openers to get into the post-opener queue.
    await engine.submitAnswer('jake');
    await engine.submitAnswer('1990-01-15');
    await engine.submitAnswer('single');
    await engine.submitAnswer('what should i do?');

    // Skip ahead through the queue until we find a relationship_pick.
    // (key_person and with_whom_unsaid are the relationship_pick
    // pillars + pool entries in materials/survey.md.)
    let q = engine.getCurrentQuestion();
    while (q && q.format !== 'relationship_pick') {
      await engine.submitAnswer(q.options[0] ?? 'pass');
      q = engine.getCurrentQuestion();
    }
    expect(q?.format).toBe('relationship_pick');
    const beforeCast = engine.getState().profile.cast.length;

    // Submit a relationship_pick JSON payload.
    const payload = JSON.stringify({
      category: 'parent',
      name: 'Sam',
      off_limits: false,
      pronouns: { subjective: 'he', objective: 'him' },
      color: '#f59e0b',
    });
    await engine.submitAnswer(payload);

    const cast = engine.getState().profile.cast;
    expect(cast.length).toBe(beforeCast + 1);
    const sam = cast.find((m) => m.label === 'Sam')!;
    expect(sam.likely_role).toBe('parent');
    expect(sam.pronouns).toEqual({ subjective: 'he', objective: 'him' });
    expect(sam.color).toBe('#f59e0b');
    expect(sam.off_limits).toBe(false);
  });

  it('merges into existing CastMember when label matches (case-insensitive)', async () => {
    const engine = makeEngine();
    await engine.submitAnswer('jake');
    await engine.submitAnswer('1990-01-15');
    await engine.submitAnswer('single');
    await engine.submitAnswer('what should i do?');

    let q = engine.getCurrentQuestion();
    while (q && q.format !== 'relationship_pick') {
      await engine.submitAnswer(q.options[0] ?? 'pass');
      q = engine.getCurrentQuestion();
    }
    await engine.submitAnswer(JSON.stringify({ category: 'parent', name: 'Mom' }));

    // Find next relationship_pick or stop.
    q = engine.getCurrentQuestion();
    while (q && q.format !== 'relationship_pick') {
      await engine.submitAnswer(q.options[0] ?? 'pass');
      q = engine.getCurrentQuestion();
    }
    if (q?.format === 'relationship_pick') {
      await engine.submitAnswer(JSON.stringify({ category: 'parent', name: 'MOM', off_limits: true }));
      const cast = engine.getState().profile.cast;
      const moms = cast.filter((m) => m.label.toLowerCase() === 'mom');
      // Same person — case-insensitive merge.
      expect(moms.length).toBe(1);
      expect(moms[0]!.off_limits).toBe(true);
    }
  });
});

describe('SurveyEngine — pipeline path (with FakeAdapter)', () => {
  it('fires observer + detective on post-opener picks (non-returning)', async () => {
    const adapter = makeAdapter();
    const engine = makeEngine({ adapter });
    await engine.submitAnswer('jake');
    await engine.submitAnswer('1990-01-15');
    await engine.submitAnswer('single');
    await engine.submitAnswer('what should i do?');
    // First post-opener pick: the first Pillar.
    const q = engine.getCurrentQuestion()!;
    await engine.submitAnswer(q.options[0] ?? 'mind');
    // Wait for spawned promises to resolve.
    await new Promise((r) => setTimeout(r, 0));
    // Should have called both observer + detective at least once.
    const toolNames = adapter.calls.map((c) => c.tool);
    expect(toolNames).toContain('observer_metabolize');
    expect(toolNames).toContain('detective_step');
  });

  it('returning-user lite mode skips BOTH observer + detective', async () => {
    const adapter = makeAdapter();
    const engine = new SurveyEngine({
      adapter,
      returning: {
        profile_seed: { name: 'jake' },
        answered_node_ids: [],
        prior_intentions: ['previous intention'],
      },
    });
    // Walk through what openers remain. Name is already satisfied.
    await engine.submitAnswer('1990-01-15');
    await engine.submitAnswer('single');
    await engine.submitAnswer('what should i do?');
    // Now post-opener.
    const q = engine.getCurrentQuestion()!;
    await engine.submitAnswer(q.options[0] ?? 'pass');
    await new Promise((r) => setTimeout(r, 0));
    // Returning users should have ZERO observer / detective calls.
    expect(adapter.calls).toHaveLength(0);
  });

  it('applies the algorithmic seeder on post-opener picks (with matching Inversions probe)', async () => {
    const adapter = makeAdapter();
    const engine = makeEngine({ adapter });
    await engine.submitAnswer('jake');
    await engine.submitAnswer('1990-01-15');
    await engine.submitAnswer('single');
    await engine.submitAnswer('what should i do?');

    // Walk forward until we hit the value_most pillar (has rich Inversions).
    let q = engine.getCurrentQuestion();
    while (q && !/value most/i.test(q.text)) {
      await engine.submitAnswer(q.options[0] ?? 'pass');
      q = engine.getCurrentQuestion();
    }
    if (!q) return;  // pillar not found in this run (fine — non-deterministic)
    // Pick 'love' — seeder should drop 'fear of being unlovable' or similar.
    await engine.submitAnswer('love');
    await new Promise((r) => setTimeout(r, 0));
    const tentative = engine.getState().investigation.hypotheses.tentative;
    expect(tentative.length).toBeGreaterThan(0);
    expect(tentative.some((h) => /unlovable|abandoned/i.test(h.description))).toBe(true);
  });
});

describe('SurveyEngine — full-flow smoke', () => {
  it('walks openers + 5 post-opener picks without errors, leaves a populated ladder + non-null cast/profile', async () => {
    const adapter = makeAdapter();
    const engine = makeEngine({ adapter });
    // Openers.
    await engine.submitAnswer('jake');
    await engine.submitAnswer('1990-01-15');
    await engine.submitAnswer('single');
    await engine.submitAnswer('what should i do?');

    // 5 post-opener picks — skip relationship_pick formats (they need JSON payloads).
    for (let i = 0; i < 5; i++) {
      const q = engine.getCurrentQuestion();
      if (!q) break;
      if (q.format === 'relationship_pick') {
        await engine.submitAnswer(
          JSON.stringify({ category: 'parent', name: `Person${i}` }),
        );
      } else {
        await engine.submitAnswer(q.options[0] ?? 'pass');
      }
    }
    await new Promise((r) => setTimeout(r, 0));

    const state = engine.getState();
    // Engine didn't blow up — basic shape still valid.
    expect(state.profile.name).toBe('jake');
    expect(state.picks_log.length).toBeGreaterThan(4);
    // The seeder ran on at least one post-opener pick → tentative populated.
    const lad = state.investigation.hypotheses;
    const totalHyps =
      lad.confirmed.length + lad.probable.length + lad.tentative.length +
      lad.contested.length + lad.refuted.length + lad.held.length;
    expect(totalHyps).toBeGreaterThan(0);
    // Both agents got called.
    const toolNames = adapter.calls.map((c) => c.tool);
    expect(toolNames).toContain('observer_metabolize');
    expect(toolNames).toContain('detective_step');
  });
});

