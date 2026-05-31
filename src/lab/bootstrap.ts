// Bench bootstrap — auto-fill openers + pillars with a default
// persona so the detective-focus view drops into Interrogation
// immediately without clicking through five pillar questions for
// every iteration cycle.
//
// The default persona ("alice") is sketched in a way that gives the
// detective something real to work with: anxious-leaning attachment,
// numb-but-present body baseline, partnered with theo, freedom over
// security on the value pillar. Detective should be able to surface
// something live around identity-cost-of-staying / autonomy-vs-
// belonging within a handful of assertions.
//
// Bootstrap matches by question FORMAT rather than node_id, so it
// stays robust to pillar reorderings or rewordings in
// materials/survey.md.

import type { SurveyEngine } from '../pipeline/survey';

export type Persona = {
  name: string;
  birthday: string;            // YYYY-MM-DD
  relationship: string;        // one of RELATIONSHIP_STATUS_OPTIONS
  intent: string;              // free text; '' = pressed "I DON'T KNOW"
  /** Ordered pillar answers. Each entry should match the rendered
   *  question's accepted shape: a choice option string for 'choice' /
   *  'matrix' / 'binary'; the relationship-pick JSON payload for
   *  'relationship_pick'; a free-text string for 'text' / 'intent'. */
  pillarAnswers: string[];
  /** Partner name for the relationship_pick payload — used when the
   *  active pillar's format is relationship_pick. */
  partnerName?: string;
};

export const DEFAULT_PERSONA: Persona = {
  name: 'alice',
  birthday: '1991-01-01',
  relationship: 'in a relationship',
  intent: '',
  partnerName: 'theo',
  pillarAnswers: [
    'mostly',                     // basics
    'assume the worst',           // goes_quiet
    'numb + present',             // body_baseline
    '__PARTNER__',                // sentinel for center_of_life relationship_pick
    'freedom',                    // want_most
  ],
};

/** Auto-progress an engine through its openers + pillars using the
 *  persona's answers. Returns when the engine's stage has left
 *  'questions' (so detective is firing or about to). Each call
 *  awaits engine.submitAnswer to keep state coherent. */
export async function bootstrapWithPersona(
  engine: SurveyEngine,
  persona: Persona = DEFAULT_PERSONA,
): Promise<void> {
  let pillarIdx = 0;
  let safety = 0;
  while (safety++ < 30) {
    const state = engine.getState();
    if (state.stage !== 'questions') return;
    const q = engine.getCurrentQuestion();
    if (!q) return;

    const answer = answerFor(q, persona, pillarIdx);
    if (answer === null) return;        // unsupported format — bail

    if (isPillarFormat(q.format)) pillarIdx++;
    await engine.submitAnswer(answer);
  }
}

function isPillarFormat(format: string): boolean {
  return format === 'choice' || format === 'binary' || format === 'matrix' || format === 'relationship_pick';
}

function answerFor(
  q: { node_id: string; format: string },
  persona: Persona,
  pillarIdx: number,
): string | null {
  // Openers first.
  if (q.node_id === 'name')     return persona.name;
  if (q.node_id === 'birthday') return persona.birthday;
  if (q.node_id === 'intent')   return persona.intent;
  if (q.format === 'relationship_status') return persona.relationship;

  // Pillars by format.
  if (q.format === 'relationship_pick') {
    const partner = persona.partnerName ?? 'theo';
    return JSON.stringify({ category: 'partner', name: partner });
  }
  if (q.format === 'choice' || q.format === 'binary' || q.format === 'matrix') {
    return persona.pillarAnswers[pillarIdx] ?? null;
  }
  return null;
}
