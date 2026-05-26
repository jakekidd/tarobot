// Compiler output schema fuzz tests — validates the DilemmaDocument
// shape that the seer will eventually read directly (post-task #35).

import { describe, expect, it } from 'vitest';
import {
  DilemmaDocumentSchema,
  type DilemmaDocument,
} from '../../src/pipeline/survey/agents/compiler';
import { renderDilemmaAsAnchor } from '../../src/pipeline/survey/agents/compiler/render';

function makeValidDoc(): DilemmaDocument {
  return {
    subject_name: 'maren',
    doc_v: 0,
    resolution_path: 'matched-candidate',
    reasoning: 'staying-as-self-protection won — multiple warm corrections converged.',
    label: 'staying-as-self-protection',
    delta_description:
      'you are sitting in a day-job that the surface conversation calls "fine" but that your body is registering as a slow withdrawal from the version of yourself you want to be. the reading is trying to surface the cost of "fine."',
    fork: {
      do_nothing_branch: 'you keep doing the job and continue paying the tax of not quite living your life',
      alternative_branch: 'you leave the hedge behind and accept the exposure of writing without a fallback',
    },
    awareness: 'partial',
    confidence: 'high',
    domain_tags: ['work', 'self'],
    null_landing: false,
    critical_hypotheses: [
      {
        claim: 'the subject is performing okayness about the day-job as a way to avoid the bigger fork',
        evidence: 'warm on assertion 1; entry 4 — "less the job, more what staying says about me"',
        confidence: 'high',
      },
    ],
    specifics: 'theo is the partner; he supports leaving (entry 5).',
    holding: 'guarded but correcting — she answers fast then revises.',
    suspicions: 'possibly post-rupture creative identity loss (low confidence).',
  };
}

function makeNullLanding(): DilemmaDocument {
  return {
    subject_name: 'maren',
    doc_v: 0,
    resolution_path: 'null-landing',
    reasoning: 'evidence was genuinely thin across all candidates.',
    label: 'no-dilemma-resolved',
    delta_description: 'no clear delta surfaced.',
    fork: { do_nothing_branch: '—', alternative_branch: '—' },
    awareness: 'unaware',
    confidence: 'low',
    domain_tags: [],
    null_landing: true,
    critical_hypotheses: [],
    specifics: '',
    holding: '',
    suspicions: '',
  };
}

describe('DilemmaDocumentSchema — happy path', () => {
  it('validates a well-formed document', () => {
    const r = DilemmaDocumentSchema.safeParse(makeValidDoc());
    expect(r.success).toBe(true);
  });

  it('validates the null-landing variant', () => {
    const r = DilemmaDocumentSchema.safeParse(makeNullLanding());
    expect(r.success).toBe(true);
  });
});

describe('DilemmaDocumentSchema — enum guards', () => {
  it('rejects unknown domain_tags', () => {
    const doc = makeValidDoc();
    (doc.domain_tags as string[]).push('vibes');
    const r = DilemmaDocumentSchema.safeParse(doc);
    expect(r.success).toBe(false);
  });

  it('rejects invalid confidence values', () => {
    const doc = { ...makeValidDoc(), confidence: 'maybe' } as unknown;
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects invalid awareness values', () => {
    const doc = { ...makeValidDoc(), awareness: 'kinda' } as unknown;
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects invalid resolution_path values', () => {
    const doc = { ...makeValidDoc(), resolution_path: 'made-it-up' } as unknown;
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe('DilemmaDocumentSchema — fork is required', () => {
  it('rejects missing fork', () => {
    const doc = makeValidDoc();
    delete (doc as { fork?: unknown }).fork;
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects fork with missing do_nothing_branch', () => {
    const doc = makeValidDoc();
    delete (doc.fork as { do_nothing_branch?: unknown }).do_nothing_branch;
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(false);
  });

  // NB: schema permits EMPTY-STRING do_nothing_branch — the quality
  // check in scripts/smoke-pipeline catches that case at runtime.
  // Documenting it here so a future tightening of the schema is
  // intentional, not accidental.
  it('does NOT reject empty-string fork branches (quality check, not schema)', () => {
    const doc = makeValidDoc();
    doc.fork.do_nothing_branch = '';
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe('DilemmaDocumentSchema — critical_hypotheses', () => {
  it('accepts an empty list', () => {
    const doc = makeValidDoc();
    doc.critical_hypotheses = [];
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('rejects critical_hypothesis with invalid confidence', () => {
    const doc = makeValidDoc();
    (doc.critical_hypotheses[0] as { confidence: string }).confidence = 'maximum';
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(false);
  });

  // Schema does NOT enforce that evidence is anchored — that's a
  // quality check at compiler time. Schema only requires it's a
  // non-empty string... actually it requires .string() with no
  // minimum, so empty would pass too. The compiler prompt enforces
  // the discipline; the smoke rig's quality checker verifies post-
  // hoc. Pinning current behaviour.
  it('does NOT enforce anchored evidence (prompt + smoke check do)', () => {
    const doc = makeValidDoc();
    doc.critical_hypotheses[0]!.evidence = 'just a hunch, nothing anchored';
    expect(DilemmaDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe('renderDilemmaAsAnchor', () => {
  it('renders a heading with the subject name', () => {
    const md = renderDilemmaAsAnchor(makeValidDoc());
    expect(md.split('\n')[0]).toBe('# Subject Anchor — maren');
  });

  it('emits the Dilemma section with delta + both fork branches', () => {
    const md = renderDilemmaAsAnchor(makeValidDoc());
    expect(md).toContain('## The Dilemma');
    expect(md).toContain('day-job that the surface conversation');
    expect(md).toContain('**continuing as you are**');
    expect(md).toContain('**the alternative**');
  });

  it('emits Critical Hypotheses section when present', () => {
    const md = renderDilemmaAsAnchor(makeValidDoc());
    expect(md).toContain('## Critical Hypotheses');
    expect(md).toContain('performing okayness');
    expect(md).toContain('warm on assertion 1');
  });

  it('emits a thin Dilemma section + no other content on null-landing', () => {
    const md = renderDilemmaAsAnchor(makeNullLanding());
    expect(md).toContain('no Dilemma resolved');
    expect(md).not.toContain('## Critical Hypotheses');
    expect(md).not.toContain('## Specifics');
    expect(md).not.toContain('## Suspicions');
  });

  it('respects the Suspicions DO NOT VOICE fence header', () => {
    const md = renderDilemmaAsAnchor(makeValidDoc());
    expect(md).toContain('## Suspicions — DO NOT VOICE');
  });

  it('omits empty freeform sections', () => {
    const doc = makeValidDoc();
    doc.specifics = '';
    doc.holding = '';
    doc.suspicions = '';
    const md = renderDilemmaAsAnchor(doc);
    expect(md).not.toContain('## Specifics');
    expect(md).not.toContain('## Holding');
    expect(md).not.toContain('## Suspicions');
  });
});
