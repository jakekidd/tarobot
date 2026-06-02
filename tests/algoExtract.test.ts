// Algorithmic end-of-antechamber extraction tests. No inference; pure data
// transforms over picks_log + timing_log.

import { describe, expect, it } from 'vitest';
import { extractHooks, extractSideChannel } from '../src/pipeline/antechamber/algoExtract';
import type { PickEvent, TimingEvent } from '../src/pipeline/antechamber/types';

function pick(node_id: string, answer: string | string[], extras: Partial<PickEvent> = {}): PickEvent {
  return {
    node_id,
    question_text: extras.question_text ?? `Q for ${node_id}`,
    options_shown: extras.options_shown ?? [],
    answer,
    answered_at: extras.answered_at ?? Date.now(),
    latency_ms: extras.latency_ms ?? 2000,
    prompted_by: extras.prompted_by,
  };
}

function timing(node_id: string, latency_ms: number, extras: Partial<TimingEvent> = {}): TimingEvent {
  return {
    node_id,
    rendered_at: 0,
    answered_at: latency_ms,
    latency_ms,
    revisions: extras.revisions ?? 0,
    interaction_count: extras.interaction_count ?? 1,
    initial_pick: extras.initial_pick ?? null,
    final_pick: extras.final_pick ?? 'final',
  };
}

describe('extractHooks', () => {
  it('returns empty array for no picks', () => {
    expect(extractHooks([])).toEqual([]);
  });

  it('includes the user name from the name opener', () => {
    const out = extractHooks([pick('name', 'jake')]);
    expect(out).toContain('jake');
  });

  it('skips other openers (birthday, relationship, intent)', () => {
    const out = extractHooks([
      pick('name', 'jake'),
      pick('birthday', '1990-01-15'),
      pick('relationship', 'single'),
      pick('intent', 'should i move?'),
    ]);
    expect(out).toEqual(['jake']);
  });

  it('extracts post-opener answer phrases verbatim', () => {
    const out = extractHooks([
      pick('name', 'jake'),
      pick('value_most', 'love'),
      pick('how_decisions', 'mind'),
      pick('Q3', 'not enough'),
    ]);
    expect(out).toContain('love');
    expect(out).toContain('mind');
    expect(out).toContain('not enough');
  });

  it('drops JSON-encoded relationship_pick payloads', () => {
    const out = extractHooks([
      pick('key_person', '{"category":"parent","name":"jeff"}'),
    ]);
    expect(out).toEqual([]);
  });

  it('drops the literal "pass" sentinel', () => {
    const out = extractHooks([pick('q1', 'pass'), pick('q2', 'real answer')]);
    expect(out).toEqual(['real answer']);
  });

  it('drops very long answers (>60 chars)', () => {
    const longAnswer = 'a'.repeat(70);
    const out = extractHooks([pick('q1', longAnswer), pick('q2', 'short')]);
    expect(out).toEqual(['short']);
  });

  it('dedupes repeated phrases across picks', () => {
    const out = extractHooks([pick('q1', 'love'), pick('q2', 'love'), pick('q3', 'fear')]);
    expect(out.filter((h) => h === 'love')).toHaveLength(1);
  });

  it('extracts elements of array answers', () => {
    const out = extractHooks([pick('multi', ['a', 'b', 'c'])]);
    expect(out).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });
});

describe('extractSideChannel', () => {
  it('returns empty object for no input', () => {
    expect(extractSideChannel([], [])).toEqual({});
  });

  it('surfaces fast picks as pre-loaded answers', () => {
    const t = [timing('value_most', 568)];
    const p = [pick('value_most', 'love', { latency_ms: 568 })];
    const out = extractSideChannel(t, p);
    expect(out.signals).toMatch(/pre-loaded/i);
    expect(out.signals).toMatch(/love/);
    expect(out.signals).toMatch(/568/);
  });

  it('surfaces slow picks as deliberation', () => {
    const t = [timing('fork_q', 21000)];
    const p = [pick('fork_q', 'continue', { latency_ms: 21000 })];
    const out = extractSideChannel(t, p);
    expect(out.signals).toMatch(/deliberation/i);
    expect(out.signals).toMatch(/continue/);
  });

  it('flags an empty intent opener as diagnostic', () => {
    const out = extractSideChannel([], [pick('intent', '')]);
    expect(out.signals).toMatch(/empty/i);
    expect(out.signals).toMatch(/stated question/i);
  });

  it('detects initial != final pick (social filter)', () => {
    const t = [timing('q1', 5000, { initial_pick: 'wolf', final_pick: 'dog' })];
    const p = [pick('q1', 'dog')];
    const out = extractSideChannel(t, p);
    expect(out.signals).toMatch(/social filter/i);
    expect(out.signals).toMatch(/wolf/);
    expect(out.signals).toMatch(/dog/);
  });

  it('ignores fast picks on openers (they\'re identity gathers, not signal)', () => {
    const t = [timing('name', 800)];
    const p = [pick('name', 'jake', { latency_ms: 800 })];
    const out = extractSideChannel(t, p);
    expect(out).toEqual({});
  });
});
