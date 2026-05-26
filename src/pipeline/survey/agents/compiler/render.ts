// Render a DilemmaDocument to the markdown anchor the Seer's existing
// assembleProfile path consumes via state.anchor. Lossy by design —
// the Seer was built before the structured Dilemma existed; the
// rendered markdown lets it keep working without touching its prompts.
// A future Seer-side refactor will read the structured document
// directly.

import type { DilemmaDocument } from './schema';

export function renderDilemmaAsAnchor(doc: DilemmaDocument): string {
  const lines: string[] = [];
  lines.push(`# Subject Anchor — ${doc.subject_name}`, '');

  lines.push('## The Dilemma', '');
  if (doc.null_landing) {
    lines.push('no Dilemma resolved; the evidence is genuinely thin.', '');
  } else {
    lines.push(doc.delta_description, '');
    lines.push(`fork: **continuing as you are** — ${doc.fork.do_nothing_branch}`);
    lines.push(`vs. **the alternative** — ${doc.fork.alternative_branch}`, '');
    if (doc.domain_tags.length > 0) {
      lines.push(`domain: ${doc.domain_tags.join(', ')}`, '');
    }
    lines.push(`awareness: ${doc.awareness}  ·  confidence: ${doc.confidence}`, '');
  }

  if (doc.critical_hypotheses.length > 0) {
    lines.push('## Critical Hypotheses', '');
    for (const h of doc.critical_hypotheses) {
      lines.push(`- **${h.claim}** _(${h.confidence})_`);
      lines.push(`  evidence: ${h.evidence}`);
    }
    lines.push('');
  }

  if (doc.specifics.trim().length > 0) {
    lines.push('## Specifics', '', doc.specifics.trim(), '');
  }

  if (doc.holding.trim().length > 0) {
    lines.push('## Holding', '', doc.holding.trim(), '');
  }

  if (doc.suspicions.trim().length > 0) {
    lines.push('## Suspicions — DO NOT VOICE', '', doc.suspicions.trim(), '');
  }

  return lines.join('\n');
}
