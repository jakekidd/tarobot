// Phase 4 generation pipeline tests.
//
// Exercises the assemble + lint logic + the end-to-end generation
// flow via FakeAdapter responses for interrogator + crowd. The
// LivingDoc / Detective integration is verified separately in
// engine.test.ts.

import { describe, expect, it } from 'vitest';
import {
  FakeAdapter,
  defaultCrowdOutput,
  defaultInterrogatorOutput,
} from './fakeAdapter';
import { generateQuestion } from '../src/pipeline/survey/generation';

function adapter(): FakeAdapter {
  return new FakeAdapter()
    .setTool('interrogator_phrase', () => defaultInterrogatorOutput())
    .setTool('crowd_decoys', () => defaultCrowdOutput());
}

describe('generation: happy path', () => {
  it('returns a QueueItem with inline payload + is_engine_authored=true', async () => {
    const result = await generateQuestion(adapter(), {
      angle: 'test the rationalist-armor read',
      planted_options: ['armor on'],
    });
    expect(result).not.toBeNull();
    expect(result!.item.is_engine_authored).toBe(true);
    expect(result!.item.options_override).toBeDefined();
    expect(result!.item.options_override!.length).toBeGreaterThanOrEqual(2);
    expect(result!.retried).toBe(false);
  });

  it('node_id encodes a synthetic gen-prefix tag', async () => {
    const result = await generateQuestion(adapter(), {
      angle: 'test',
    });
    expect(result!.item.node_id.startsWith('gen_')).toBe(true);
  });

  it('places planted options before crowd decoys before shuffle', async () => {
    // Pin determinism by overriding Math.random just for this test.
    const orig = Math.random;
    Math.random = () => 0;   // makes the in-place shuffle a no-op
    try {
      const result = await generateQuestion(adapter(), {
        angle: 'test',
        planted_options: ['planted A', 'planted B'],
      });
      // Shuffle with Math.random()===0 happens to leave the first
      // element in place (j=0 each iteration). We just assert both
      // planted survived the cap.
      expect(result!.item.options_override).toEqual(
        expect.arrayContaining(['planted A', 'planted B']),
      );
    } finally {
      Math.random = orig;
    }
  });
});

describe('generation: lint failures', () => {
  it('rejects a stem that does not end with ?', async () => {
    const a = new FakeAdapter()
      .setTool('interrogator_phrase', () => ({
        question_text: 'this is not a question',  // missing ?
        axis_tag: 'tag',
        reasoning: '',
      }))
      .setTool('crowd_decoys', () => defaultCrowdOutput());
    // Retry will also fail because the fake adapter always returns
    // the same thing. So generation should return null.
    const result = await generateQuestion(a, { angle: 'test' });
    expect(result).toBeNull();
  });

  it('rejects a stem that is uppercase', async () => {
    const a = new FakeAdapter()
      .setTool('interrogator_phrase', () => ({
        question_text: 'What would surprise you?',
        axis_tag: 'tag',
        reasoning: '',
      }))
      .setTool('crowd_decoys', () => defaultCrowdOutput());
    expect(await generateQuestion(a, { angle: 'test' })).toBeNull();
  });

  it('rejects compound questions (>1 "?")', async () => {
    const a = new FakeAdapter()
      .setTool('interrogator_phrase', () => ({
        question_text: 'do you feel angry? or sad?',
        axis_tag: 'tag',
        reasoning: '',
      }))
      .setTool('crowd_decoys', () => defaultCrowdOutput());
    expect(await generateQuestion(a, { angle: 'test' })).toBeNull();
  });

  it('rejects when crowd decoys + planted options collide and we end up <2', async () => {
    const a = new FakeAdapter()
      .setTool('interrogator_phrase', () => defaultInterrogatorOutput())
      .setTool('crowd_decoys', () => ({
        decoys: ['armor on', 'armor on'],  // dupes of planted
        reasoning: '',
      }));
    const result = await generateQuestion(a, {
      angle: 'test',
      planted_options: ['armor on'],
    });
    expect(result).toBeNull();
  });

  it('retries on lint failure and accepts on second pass', async () => {
    // Schema requires min 2 decoys, so we can't easily simulate first
    // pass returns 0. Instead, vary stem: first pass bad (no '?'),
    // second pass good. Track call count manually.
    let callCount = 0;
    const a = new FakeAdapter()
      .setTool('interrogator_phrase', () => {
        callCount += 1;
        return callCount === 1
          ? { question_text: 'missing question mark', axis_tag: 'tag', reasoning: '' }
          : defaultInterrogatorOutput();
      })
      .setTool('crowd_decoys', () => defaultCrowdOutput());
    const result = await generateQuestion(a, { angle: 'test' });
    expect(result).not.toBeNull();
    expect(result!.retried).toBe(true);
  });
});
