// Apply-path tests.
//
// Phase 2 (survey-engine-v2): the legacy apply helpers
// (applyObserverOutput / applyDetectiveOutput / applyLadderMoves /
// addNewHypotheses / mergeStoryUpdates / removeFromLadder) all throw
// `not_implemented_v2` because the 6-rung HypothesisLadder + Investigation
// types they served are deleted. Phase 3 reimplements with the new
// shape — `applyObserverDelta(state, delta)` and `applyDetectiveMove
// (state, move)` over LivingDoc — and this file gets rewritten around
// those.
//
// For now we keep this file alive testing only `probeToString` (a
// pure helper on types.ts that survived the rip), with `.todo`
// placeholders documenting the Phase 3 surface.

import { describe, expect, it } from 'vitest';
import { probeToString } from '../src/pipeline/survey/types';

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
    const out = probeToString({ surface: 'a' });
    expect(out).toBe('surface: a');
  });
});

// ─── Phase 3 surface placeholders ──────────────────────────

describe('applyObserverDelta (Phase 3)', () => {
  it.todo('folds axes_updates into doc.scaffold.axes (REPLACE by key)');
  it.todo('appends margin_append entries to doc.margin (capped at MARGIN_CAP, oldest-evict)');
  it.todo('appends tells to doc.scaffold.tells (capped at TELLS_CAP)');
  it.todo('updates cast_updates by label (REPLACE)');
  it.todo('updates temporal_lean when delta provides it');
  it.todo('bumps doc.v on every successful apply');
  it.todo('discards stale delta when based_on_v !== current doc.v');
});

describe('applyDetectiveMove (Phase 3)', () => {
  it.todo('append: pushes new QueueItem to queue.tail');
  it.todo('revise: replaces queue.tail[N] (staleness-gated)');
  it.todo('conclude: flushes queue.tail and transitions stage to finalizing');
  it.todo('story_updates: partial-merge into doc.story (fork/pressure/root/stakes replace; hooks append+dedupe)');
  it.todo('updates doc.scaffold.leading_hypothesis when provided');
  it.todo('bumps doc.v when the move mutates doc');
});

describe('recomputeCoverage (Phase 3)', () => {
  it.todo('pure function over (doc, picks_log)');
  it.todo('produces per-dimension {confidence, contention, gap, sources}');
  it.todo('always includes temporal_lean as a named dimension');
});
