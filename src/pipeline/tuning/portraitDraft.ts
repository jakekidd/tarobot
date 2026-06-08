// draftPortrait — a deterministic stand-in for the Condenser.
//
// The real Condenser (one Sonnet call) synthesizes the RawPortrait into a
// markdown Portrait with confidence-tagged central leads, patterns, tensions,
// cast, posture. It isn't wired yet. Until it is, this lays the weight-ranked
// amalgam out as markdown so the Conjector has real leads to hunt and the
// whole survey → conjector flow is playable end to end. NO synthesis — just
// the ranked signal, fenced as a draft so no one mistakes it for the real read.

import type { RawPortrait } from '../introduction-survey';
import type { Portrait } from './types';

export function draftPortrait(raw: RawPortrait): Portrait {
  const { identity, amalgam } = raw;
  const list = (xs: string[], n: number) =>
    xs.slice(0, n).map((s) => `- ${s}`).join('\n') || '- (none)';

  const markdown = [
    `# Portrait — ${identity.name || 'unknown'} (draft)`,
    '',
    '_Condenser not wired — this is the raw amalgam laid out by weight, not a synthesis._',
    '',
    '## Central leads (hottest first)',
    list(amalgam.implications, 8),
    '',
    '## Facts',
    list(amalgam.indicators, 8),
    '',
    '## Character hypotheses',
    list(amalgam.identities, 8),
    '',
    '## Negative space (what they declined)',
    list(amalgam.shadows, 6),
  ].join('\n');

  return { markdown, raw };
}
