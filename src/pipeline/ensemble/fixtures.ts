// Defaults for the xray lab and the headless harnesses. Real sessions
// start BLIND — no docs, no brief; the beat grammar owns the opening
// (materials/ensemble/beats.json) and the engine draws its own cards
// at deal time. The docs channel survives only as a lab experiment.

import type { EnsembleInput, InputDoc } from './types';

/** the default intake document — lab experiment channel only */
export const DEFAULT_DOC_MD = `# intake — maya

## who sat down
maya, mid-thirties. came alone. picked the late slot.

## what the intake learned
- the year has been "heavy but moving" — her words, offered quickly,
  like a line she has said before.
- works a job she has already left in spirit. describes it in past
  tense without noticing.
- one sister, older. comes up three times without being asked about.
  maya navigates her rather than names her.
- when asked what she wants more of, she said "quiet," then laughed
  and took it back.

## the shape under it
she leads with competence. what she keeps almost saying is that she is
tired of being the one who holds it. rest reads as risk to her.
composed, self-auditing, allergic to being handled. she will meet a
direct read with honesty if it arrives without pity.

## leads, sharpest first
1. the sister is load-bearing — approval or dependence, unclear which.
2. the job stopped being about the work; find what it stands in for.
3. rest reads as risk; find what rest would cost her.

## taboos
(none named)
`;

export const BLANK_DOC_MD = `# intake — (name)

## who sat down

## what the intake learned
-

## the shape under it

## leads, sharpest first
1.

## taboos
(none named)
`;

export function defaultDocs(): InputDoc[] {
  const now = Date.now();
  return [
    { id: 'doc-maya', name: 'maya — intake portrait', md: DEFAULT_DOC_MD, updatedAt: now },
    { id: 'doc-blank', name: 'blank template', md: BLANK_DOC_MD, updatedAt: now },
  ];
}

export const DEFAULT_SCENARIO_CHAT =
  'a festival booth, late. the visitor has just sat down across from you. you have never met.';

export const DEFAULT_SCENARIO_SESSION =
  'a festival booth, late. the visitor has just sat down across from you. you have never met. cards are dealt only after you have heard them.';

export function defaultChatInput(docs: InputDoc[] = []): EnsembleInput {
  return { mode: 'chat', docs, scenario: DEFAULT_SCENARIO_CHAT, taboos: [] };
}

/** the default session is BLIND — the real thing */
export function defaultSessionInput(docs: InputDoc[] = []): EnsembleInput {
  return { mode: 'session', docs, scenario: DEFAULT_SCENARIO_SESSION, taboos: [] };
}
