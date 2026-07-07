// The frame — the seer's standing orientation. Markdown, not schema.
// Frame v1 is assembled deterministically from the input (no model call,
// zero start latency); attention regenerates it whole thereafter.

import type { EnsembleInput, Frame, FrameTrigger } from './types';

export function frameV1(input: EnsembleInput): Frame {
  const lines: string[] = ['# frame v1', '## focus'];

  const brief = input.brief;
  if (brief?.fork) {
    lines.push(`- the fork: ${brief.fork.surface}, and under it: ${brief.fork.reframe}`);
  } else if (brief && brief.leads.length > 0) {
    for (const lead of brief.leads.slice(0, 2)) lines.push(`- ${lead}`);
  } else {
    lines.push('- meet them. find what they carried in; you have documents, not the person.');
  }

  if (input.mode === 'session' && brief) {
    lines.push('## dressings');
    for (const card of brief.cards) {
      const firstSentence = card.guide.split(/(?<=[.!?])\s/)[0] ?? card.guide;
      lines.push(`- slot ${card.slot} (unflipped, weather only): ${firstSentence}`);
    }
  }

  lines.push('## stance');
  lines.push(
    '- discovery posture: earn the room before pressing. the documents are a sketch, not the person.',
  );

  lines.push('## carried');
  if (brief?.name) lines.push(`- their name: ${brief.name}`);
  if (brief?.companion) lines.push(`- companion in the room: ${brief.companion}`);
  if (!brief?.name && !brief?.companion) lines.push('- nothing yet.');

  lines.push('## prohibitions');
  const taboos = [...(input.taboos ?? []), ...(brief?.taboos ?? [])];
  for (const t of taboos) lines.push(`- ${t}`);
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
