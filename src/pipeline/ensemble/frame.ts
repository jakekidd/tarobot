// The frame — the oracle's standing orientation. Markdown, not schema.
// Frame v1 is assembled deterministically (no model call, zero start
// latency); attention regenerates it whole thereafter. Sessions start
// BLIND — the frame opens in pure discovery posture.

import type { EnsembleInput, Frame, FrameTrigger } from './types';

export function frameV1(input: EnsembleInput): Frame {
  const lines: string[] = ['# frame v1', '## focus'];
  lines.push(
    '- meet them. the room is empty until they fill it; every thread starts with what they actually say.',
  );
  if (input.docs.length > 0) {
    lines.push('- documents were provided (lab experiment); they are a sketch, never the person.');
  }

  lines.push('## stance');
  lines.push(
    '- discovery posture: this is question time. one real question at a time; earn the room before reading it.',
  );

  lines.push('## carried');
  lines.push('- nothing yet. their name when they give it.');

  lines.push('## prohibitions');
  for (const t of input.taboos ?? []) lines.push(`- ${t}`);
  lines.push('- never name a card. no advice, no verdicts, no predictions.');

  return { v: 1, md: lines.join('\n'), trigger: 'boot', t: Date.now() };
}

export class FrameStore {
  private frames: Frame[];

  constructor(v1: Frame) {
    this.frames = [v1];
  }

  current(): Frame {
    return this.frames[this.frames.length - 1];
  }

  push(md: string, trigger: FrameTrigger): Frame {
    const frame: Frame = { v: this.frames.length + 1, md, trigger, t: Date.now() };
    this.frames.push(frame);
    return frame;
  }

  history(): readonly Frame[] {
    return this.frames;
  }
}
