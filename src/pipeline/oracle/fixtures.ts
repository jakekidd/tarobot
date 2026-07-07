// Hand-authored briefs so the beta page runs without burning an intake +
// compile every iteration. FIXTURE_BRIEF is a full session; CHAT_BRIEF is
// the from-zero conversation seed (no cards, no portrait — the director
// hunts live).

import type { OracleBrief } from './types';

export const FIXTURE_BRIEF: OracleBrief = {
  name: 'maya',
  portrait:
    'maya, mid-thirties, describes a year that has been heavy but moving — ' +
    'her words. she is carrying a job she has already left in spirit, and a ' +
    'sister whose gravity she navigates rather than names. she leads with ' +
    'competence; what she keeps almost saying is that she is tired of being ' +
    'the one who holds it. posture: composed, self-auditing, allergic to ' +
    'being handled. she will meet a direct read with honesty if it arrives ' +
    'without pity.',
  fork: {
    surface: 'do i quit the job or stay another year',
    reframe: 'is she allowed to put down something she can still carry',
  },
  leads: [
    'the sister is load-bearing — approval or dependence, unclear which',
    'the job stopped being about the work; find what it stands in for',
    'rest reads as risk to her; find what rest would cost',
  ],
  cards: [
    {
      id: 'ten-of-wands',
      name: 'ten of wands',
      slot: 1,
      guide:
        'open on the carrying. she presents strength; the card licenses ' +
        'naming the load without calling it weakness. the town is in sight — ' +
        'ask what almost-home means to her, and watch whether she counts the ' +
        'job or the sister among the staves.',
    },
    {
      id: 'two-of-swords',
      name: 'two of swords',
      slot: 2,
      guide:
        'the stalemate is maintained, not suffered — the blindfold is tied ' +
        'by her own hand. press gently on what looking directly at the ' +
        'choice would cost. do not resolve the tie; make the effort of ' +
        'holding it visible.',
    },
    {
      id: 'eight-of-cups',
      name: 'eight of cups',
      slot: 3,
      guide:
        'the turn. the leaving is already underway in her — orderly, ' +
        'unannounced. surface the question under the question here: not ' +
        'whether to go, but whether she is allowed to. the gap in the stack ' +
        'is what she would be admitting.',
    },
    {
      id: 'the-star',
      name: 'the star',
      slot: 4,
      guide:
        'close quiet. after the naming, lower the volume: what does she ' +
        'look like undefended, after the load is down. no triumph — ' +
        'permission. leave her with the image of water given back to the pool.',
    },
  ],
  opening:
    'sit. you carry well — most people set things down before they come to ' +
    'my table. you didn\'t.',
  mantra: 'what you can carry was never the question.',
  taboos: [],
};

export const CHAT_BRIEF: OracleBrief = {
  portrait: '',
  fork: null,
  leads: [],
  cards: [],
  opening:
    'sit with me. you came without an appointment and without a story — ' +
    'those are my favorite. say anything, or nothing; we start where you are.',
  mantra: '',
  taboos: [],
};
