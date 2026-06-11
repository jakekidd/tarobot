// draftPortrait — the deterministic FALLBACK for the Condenser.
//
// The real Condenser (one Sonnet call) synthesizes the RawPortrait into a
// markdown Portrait with confidence-tagged central leads, patterns, tensions,
// cast, posture. When that call fails, this lays the weight-ranked amalgam
// out as markdown so the Conjector still has real leads to hunt rather than
// dead-ending the session. NO synthesis — just the ranked signal, fenced as
// a draft so no one (human or model) mistakes it for the real read.

import type { RawPortrait } from '../introduction-survey';
import type { Portrait } from './types';

export function draftPortrait(raw: RawPortrait): Portrait {
  const { identity, amalgam } = raw;
  const list = (xs: string[], n: number) =>
    xs.slice(0, n).map((s) => `- ${s}`).join('\n') || '- (none)';

  const markdown = [
    `# Portrait — ${identity.name || 'unknown'} (draft)`,
    '',
    '_Condenser fallback — this is the raw amalgam laid out by weight, not a synthesis._',
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
