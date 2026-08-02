// The profile — the 14-facet survey, filled by cognition instead of
// asked by a turtle. The profiler agent watches the conversation and
// files freeform answers; option labels ride along only as calibration
// anchors for what each facet means. Elevated facets feed the driver's
// intro questions.

import SURVEY_RAW from '../../../materials/survey.json?raw';

type SurveyFacet = {
  slug: string;
  question: string;
  options: { label: string }[];
};

const survey = JSON.parse(SURVEY_RAW) as { facets: SurveyFacet[] };

export type FacetDigest = { slug: string; question: string; anchors: string[] };

export const FACETS: FacetDigest[] = survey.facets.map((f) => ({
  slug: f.slug,
  question: f.question,
  anchors: f.options.map((o) => o.label),
}));

export type ProfileEntry = { facet: string; answer: string; t: number };
export type ElevatedFacet = { facet: string; angle: string };

export class Profile {
  private entries = new Map<string, ProfileEntry>();
  elevated: ElevatedFacet[] = [];

  merge(updates: { facet: string; answer: string }[]): void {
    for (const u of updates) {
      this.entries.set(u.facet, { facet: u.facet, answer: u.answer, t: Date.now() });
    }
  }

  filled(): ProfileEntry[] {
    return [...this.entries.values()];
  }

  size(): number {
    return this.entries.size;
  }

  render(): string {
    if (this.entries.size === 0) return '(nothing known yet)';
    return this.filled()
      .map((e) => `- ${e.facet}: ${e.answer}`)
      .join('\n');
  }
}

export function renderFacetList(): string {
  return FACETS.map(
    (f) => `- ${f.slug}: "${f.question}" (anchors: ${f.anchors.join(' | ')})`,
  ).join('\n');
}

// ------------------------------------------------------------ dilemma

/** the conjector's living document: the problem named, the options
 *  named, and (after the midpoint) the quest. grows by async edits. */
export type DilemmaDoc = {
  problem_md?: string;
  options_md?: string;
  quest_md?: string;
};

export function dilemmaCommitted(d: DilemmaDoc): boolean {
  return Boolean(d.problem_md && d.options_md);
}

export function renderDilemma(d: DilemmaDoc): string {
  if (!dilemmaCommitted(d)) return '(not yet named)';
  const parts = [`THE PROBLEM:\n${d.problem_md}`, `THE OPTIONS:\n${d.options_md}`];
  if (d.quest_md) parts.push(`THE QUEST (draft):\n${d.quest_md}`);
  return parts.join('\n\n');
}
