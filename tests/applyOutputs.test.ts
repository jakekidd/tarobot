// Apply-path tests — v2 (Phase 3).
//
// Covers the deterministic helpers powering the sequential cognition
// core: applyObserverDelta, applyDetectiveOutput / mergeStoryUpdates,
// recomputeCoverage / isCoverageDone, rankAdversarial,
// computeLatencyZScores. The LLM-call sites (runObserver, runDetective)
// are tested through engine.test.ts with the FakeAdapter.

import { describe, expect, it } from 'vitest';
import { probeToString } from '../src/pipeline/survey/types';
import type { LivingDoc, Probe } from '../src/pipeline/survey/living-doc';
import { EMPTY_DOC } from '../src/pipeline/survey/living-doc';
import { applyObserverDelta } from '../src/pipeline/survey/agents/observer';
import { mergeStoryUpdates, applyDetectiveOutput } from '../src/pipeline/survey/agents/detective';
import { recomputeCoverage, isCoverageDone } from '../src/pipeline/survey/coverage';
import { computeLatencyZScores } from '../src/pipeline/survey/algoExtract';
import type { TimingEvent } from '../src/pipeline/survey/types';

function freshDoc(): LivingDoc {
  return JSON.parse(JSON.stringify(EMPTY_DOC)) as LivingDoc;
}

function probe(id: string, claim: string, age = 0): Probe {
  return { id, claim, source: 'seeder', born_turn: 0, age_in_turns: age };
}

// ─── probeToString (survivor helper) ───────────────────────

describe('probeToString', () => {
  it('returns undefined for empty probe', () => {
    expect(probeToString(undefined)).toBeUndefined();
    expect(probeToString({})).toBeUndefined();
  });

  it('labels each non-empty sub-field on its own line', () => {
    const out = probeToString({
      surface: 'a',
      inversions: 'b',
      watch_for: 'c',
    });
    expect(out).toBe('surface: a\ninversions: b\nwatch for: c');
  });

  it('omits empty sub-fields', () => {
    expect(probeToString({ surface: 'a' })).toBe('surface: a');
  });
});

// ─── applyObserverDelta ────────────────────────────────────

describe('applyObserverDelta', () => {
  it('bumps doc.v on every apply', () => {
    const doc = freshDoc();
    const next = applyObserverDelta(doc, {
      axes_updates: {},
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: [],
    });
    expect(next.v).toBe(doc.v + 1);
  });

  it('REPLACES axes per key (empty value clears)', () => {
    const doc: LivingDoc = { ...freshDoc(), scaffold: { ...freshDoc().scaffold, axes: { self: 'old', relational: 'keep' } } };
    const next = applyObserverDelta(doc, {
      axes_updates: { self: 'new', tensions: 'fresh' },
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: [],
    });
    expect(next.scaffold.axes.self).toBe('new');
    expect(next.scaffold.axes.relational).toBe('keep');
    expect(next.scaffold.axes.tensions).toBe('fresh');

    const cleared = applyObserverDelta(next, {
      axes_updates: { self: '' },
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: [],
    });
    expect(cleared.scaffold.axes.self).toBeUndefined();
  });

  it('appends margin_append (cap at MARGIN_CAP, oldest-evict)', () => {
    let doc = freshDoc();
    for (let i = 0; i < 20; i++) {
      doc = applyObserverDelta(doc, {
        axes_updates: {},
        cast_updates: [],
        tells: [],
        margin_append: `note-${i}`,
        probe_elevate: [],
        probe_refute: [],
      });
    }
    // MARGIN_CAP is 16; we should have the last 16 entries.
    expect(doc.margin.length).toBe(16);
    expect(doc.margin[0]).toBe('note-4');
    expect(doc.margin[15]).toBe('note-19');
  });

  it('elevates a held probe — drops from held, adds as an axis', () => {
    const doc: LivingDoc = { ...freshDoc(), held: [probe('p1', 'fears commitment')] };
    const next = applyObserverDelta(doc, {
      axes_updates: {},
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: ['p1'],
      probe_refute: [],
    });
    expect(next.held).toEqual([]);
    expect(next.scaffold.axes.probe_p1).toBe('fears commitment');
  });

  it('refutes a held probe — drops from held without elevating', () => {
    const doc: LivingDoc = { ...freshDoc(), held: [probe('p1', 'fears commitment')] };
    const next = applyObserverDelta(doc, {
      axes_updates: {},
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: ['p1'],
    });
    expect(next.held).toEqual([]);
    expect(next.scaffold.axes.probe_p1).toBeUndefined();
  });

  it('updates temporal_lean when delta provides it (incl. null)', () => {
    const doc = freshDoc();
    const past = applyObserverDelta(doc, {
      axes_updates: {},
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: [],
      temporal_lean: 'past',
    });
    expect(past.scaffold.temporal_lean).toBe('past');
    // Omitting temporal_lean leaves it unchanged.
    const unchanged = applyObserverDelta(past, {
      axes_updates: {},
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: [],
    });
    expect(unchanged.scaffold.temporal_lean).toBe('past');
    // Explicit null resets.
    const reset = applyObserverDelta(past, {
      axes_updates: {},
      cast_updates: [],
      tells: [],
      margin_append: '',
      probe_elevate: [],
      probe_refute: [],
      temporal_lean: null,
    });
    expect(reset.scaffold.temporal_lean).toBeNull();
  });
});

// ─── applyDetectiveOutput / mergeStoryUpdates ──────────────

describe('mergeStoryUpdates', () => {
  it('REPLACES fork / present_pressure / past_root / stakes when provided', () => {
    const story = {
      fork: { a: 'A', b: 'B', is_stasis: false },
      present_pressure: 'old pressure',
      past_root: null,
      stakes: null,
      hooks: [],
    };
    const next = mergeStoryUpdates(story, {
      fork: { a: 'X', b: 'Y', is_stasis: true },
      present_pressure: 'new pressure',
    });
    expect(next.fork).toEqual({ a: 'X', b: 'Y', is_stasis: true });
    expect(next.present_pressure).toBe('new pressure');
  });

  it('APPENDS + dedupes hooks', () => {
    const story = {
      fork: null,
      present_pressure: null,
      past_root: null,
      stakes: null,
      hooks: ['her dad\'s hands smelled like gasoline'],
    };
    const next = mergeStoryUpdates(story, {
      hooks: ['her dad\'s hands smelled like gasoline', 'a chair he can\'t sit in'],
    });
    expect(next.hooks).toEqual([
      'her dad\'s hands smelled like gasoline',
      'a chair he can\'t sit in',
    ]);
  });
});

describe('applyDetectiveOutput', () => {
  it('replaces leading_hypothesis + bumps doc.v when changed', () => {
    const doc = freshDoc();
    const result = applyDetectiveOutput(doc, {
      scratchpad: 'thinking...',
      leading_hypothesis: 'rationalist self-image is policing him',
      story_updates: {},
      next_move: { kind: 'append', node_id: 'value_most', reason: 'r' },
      based_on_v: 0,
      reasoning: 'r',
    });
    expect(result.nextDoc.scaffold.leading_hypothesis).toBe('rationalist self-image is policing him');
    expect(result.nextDoc.v).toBe(1);
    expect(result.move.kind).toBe('append');
  });

  it('returns the same doc reference when nothing mutates', () => {
    const doc = freshDoc();
    const result = applyDetectiveOutput(doc, {
      scratchpad: 'thinking...',
      leading_hypothesis: '',         // empty — same as initial
      story_updates: {},
      next_move: { kind: 'append', reason: 'r' },
      based_on_v: 0,
      reasoning: 'r',
    });
    expect(result.nextDoc).toBe(doc);
  });
});

// ─── coverage ──────────────────────────────────────────────

describe('recomputeCoverage', () => {
  it('always includes temporal_lean as a dimension', () => {
    const map = recomputeCoverage(freshDoc(), []);
    expect(map.temporal_lean).toBeDefined();
    expect(map.temporal_lean!.gap).toBeGreaterThan(0);
  });

  it('temporal_lean confidence climbs when scaffold.temporal_lean is set', () => {
    const doc: LivingDoc = { ...freshDoc(), scaffold: { ...freshDoc().scaffold, temporal_lean: 'present' } };
    const map = recomputeCoverage(doc, []);
    expect(map.temporal_lean!.confidence).toBeGreaterThan(0);
  });

  it('builds a dim per scaffold.axes entry with confidence by length', () => {
    const doc: LivingDoc = {
      ...freshDoc(),
      scaffold: { ...freshDoc().scaffold, axes: { tensions: 'a'.repeat(60) } },
    };
    const map = recomputeCoverage(doc, []);
    expect(map.tensions).toBeDefined();
    expect(map.tensions!.confidence).toBeCloseTo(60 / 120, 1);
  });
});

describe('isCoverageDone', () => {
  it('false when fork is null', () => {
    expect(isCoverageDone({})).toBe(false);
  });

  it('false when temporal_lean has low confidence', () => {
    expect(isCoverageDone({
      fork: { confidence: 0.9, contention: 0, gap: 0.1, sources: [] },
      temporal_lean: { confidence: 0, contention: 0, gap: 1, sources: [] },
    })).toBe(false);
  });

  it('true when fork high + lean high + ≥2 axes rich', () => {
    expect(isCoverageDone({
      fork: { confidence: 0.8, contention: 0, gap: 0.2, sources: [] },
      temporal_lean: { confidence: 0.7, contention: 0, gap: 0.3, sources: [] },
      tensions: { confidence: 0.7, contention: 0, gap: 0.3, sources: [] },
      yearnings: { confidence: 0.7, contention: 0, gap: 0.3, sources: [] },
    })).toBe(true);
  });
});

// ─── latency z-score ───────────────────────────────────────

function timing(id: string, ms: number): TimingEvent {
  return {
    node_id: id,
    rendered_at: 0,
    answered_at: ms,
    latency_ms: ms,
    revisions: 0,
    interaction_count: 1,
    initial_pick: null,
    final_pick: id,
  };
}

describe('computeLatencyZScores', () => {
  it('attaches latency_z based on per-user baseline', () => {
    const events = [
      timing('q1', 1000),
      timing('q2', 2000),
      timing('q3', 3000),
      timing('q4', 10000),   // outlier
    ];
    const enriched = computeLatencyZScores(events);
    const last = enriched[3]!;
    expect(last.latency_z).toBeGreaterThan(1.0);
  });

  it('returns z=0 for events when there is no variance', () => {
    const events = [timing('q1', 1000), timing('q2', 1000)];
    const enriched = computeLatencyZScores(events);
    expect(enriched[0]!.latency_z).toBe(0);
  });

  it('passes through when there are <2 samples', () => {
    const events = [timing('q1', 1000)];
    const enriched = computeLatencyZScores(events);
    expect(enriched).toEqual(events);
  });
});
