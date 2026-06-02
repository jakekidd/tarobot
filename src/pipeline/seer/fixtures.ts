// Demo fixtures. Used by the READ DEMO menu path to skip survey and land
// directly in a reading with a rich, hand-authored profile. Exports a
// `buildMarisolDemoSeer(adapter)` helper that returns a ready-to-use
// Seer with the fixture profile + a fresh card draw + the preferred
// intro short-circuit.

import type { LLMAdapter } from '../llm/adapter';
import type { Choice, Profile } from '../types';
import { drawForSpread } from '../cards';
import { FOUR_CARD_DIAMOND } from '../spreads';
import { Seer } from './seer';
import type { Monologue } from './types';

const MARISOL_CHOICE: Choice = {
  id: 'marisol-move-home',
  description:
    'move back to oakland to be present for her mother, or stay in nyc and continue the design career that is just gaining traction.',
  options: [
    {
      name: 'stay in nyc',
      summary: 'career momentum, partner, the version of herself she built.',
    },
    {
      name: 'move to oakland',
      summary:
        'be the daughter who answers when called; carry the weight her sister has been carrying alone.',
    },
  ],
  source: 'inferred',
  scores: { stakes: 5, time_proximity: 4, user_engagement: 5 },
  stakes: 'which version of being a daughter she gets to be for the rest of her life.',
  time_horizon: 'months',
  blindspots: [
    'she has not yet told her partner the move is on the table.',
    'she has framed this as logistics; the actual question is identity.',
    'her sister camila reached a limit recently — that is what made this urgent.',
  ],
  is_target: true,
  confidence: 0.85,
  notes:
    'the load-bearing tell: she said "i don\'t think i\'d be giving anything up" twice. nobody who is unsure says that.',
};

const MARISOL_PROFILE: Profile = {
  identity: {
    name: 'marisol',
    birth_date: '1992-08-15',
    sun_sign: 'leo',
    life_path: 8,
    tarot_birth_card: { number: 8, name: 'strength' },
    came_with: 'a partner — left them in line outside',
    notes:
      'oakland-born, nyc-based eight years. designer, just got named lead on a project that ran in two shows last year. mother lives alone in oakland since the divorce; sister camila in oakland too.',
  },
  candidates: [MARISOL_CHOICE],
  cast: [
    {
      role: 'mother',
      valence: 'alone since the divorce. the gravity of the choice.',
      last_referenced_turn: 7,
    },
    {
      role: 'older sister',
      name: 'camila',
      valence: 'carried it all until very recently. just said she is out of room.',
      last_referenced_turn: 9,
    },
    {
      role: 'partner',
      valence: 'in nyc, has not been told the move is being seriously considered.',
      last_referenced_turn: 11,
    },
    {
      role: 'absent father',
      valence: 'divorced from her mother. unmentioned by marisol.',
      last_referenced_turn: -1,
    },
  ],
  threads: [
    {
      pattern: 'frames the question as logistics (flights, leases, money)',
      observations: [2, 5, 8, 12],
      salience: 5,
    },
    {
      pattern: 'uses the phrase "i don\'t think i\'d be giving anything up"',
      observations: [4, 13],
      salience: 5,
    },
    {
      pattern: 'flat affect when describing nyc successes',
      observations: [3, 10],
      salience: 4,
    },
  ],
  hunches: [
    {
      suspicion:
        'the move is closer to decided than she is admitting. she is rehearsing the version where it costs nothing because she knows it will cost everything.',
      grounded_in: 'the "giving nothing up" phrasing + flat affect on nyc wins.',
      confidence: 0.8,
      age_turns: 4,
    },
    {
      suspicion:
        'her sister camila reaching a limit is the actual inciting event; everything else is reframe.',
      grounded_in: 'the only time her voice changed was naming camila.',
      confidence: 0.75,
      age_turns: 2,
    },
  ],
  margin:
    'she keeps almost saying something about her partner and stopping. the silence around the partner is louder than the words about the mother.',
  cognition_log:
    'fork is not stay-vs-move. fork is which-daughter. mirror the gap between her framing and the actual stakes. the camila-limit thread is the most likely place to land an early hit. avoid prescribing either path; name what each will cost.',
  highlights: [
    {
      id: 'h1',
      topic: 'the "giving nothing up" phrasing',
      reason: 'load-bearing tell. surface gently.',
      introduced_turn: 4,
      ttl: 6,
      salience: 'high',
    },
    {
      id: 'h2',
      topic: 'camila reached her limit',
      reason: 'inciting event the user has not yet named as such.',
      introduced_turn: 9,
      ttl: 6,
      salience: 'high',
    },
    {
      id: 'h3',
      topic: 'partner not told',
      reason: 'the silence beneath the silence.',
      introduced_turn: 11,
      ttl: 4,
      salience: 'medium',
    },
  ],
  brief:
    'marisol, 32, nyc designer, oakland-born. came with a logistics-shaped question that is actually an identity-shaped one. her sister camila just said she is out of room covering for their mother, and the move that was always someday now has a deadline feeling. she has not told her partner. she keeps saying "i don\'t think i\'d be giving anything up." she is rehearsing the version where it costs nothing.',
  ready_to_close: true,
  version: 4,
};

const MARISOL_PROSE_BRIEF = `marisol, 32, designer in nyc, oakland-born. came to the cards with a question framed as logistics — "should i move back home." she does not believe that is the question. beneath it: her mother, alone in oakland since the divorce, and marisol's older sister camila who has covered for everything until now. camila just told her she is out of room. so the move that was always "someday" has a tuesday-deadline feeling.

marisol describes the nyc life with a flatness that does not match the resume — design lead, two shows last year, the apartment she rebuilt. she used the phrase "i don't think i'd be giving anything up" twice during the antechamber, and that phrasing is the load-bearing tell. nobody who is unsure about a move says that. she is rehearsing the version where it costs nothing because she knows it will cost everything.

she has not told her partner the move is being seriously considered. she has not told her boss. she is carrying this decision inside her body without a witness.

the fork as she frames it: stay in nyc (career, partner, the version of herself she built) vs. move home (mother, family, a self she left). the fork as the brief sees it: which version of being a daughter is she willing to be — the one who chose herself, or the one who answers when called.

mirror, not oracle. do not advise. name the gap between her stated framing and what is underneath. the under-specified read about camila is the most likely place to land an early hit. avoid prescribing either path; name what choosing either will cost. the partner not knowing is also a thread worth pulling, gently.`;

/** Hand-written intro the antechamber side WOULD have produced for marisol. */
export const MARISOL_INTRO: Monologue = {
  text: 'marisol. sit with me. you brought something heavier than the question you came with — let us look at what wants looking at.',
};

/** Build a ready-to-use Seer for the READ DEMO path. The preferred_intro
 *  short-circuits intro generation (no LLM call); the prose_brief is
 *  pre-filled from the fixture. Seer's `ready` resolves immediately. */
export function buildMarisolDemoSeer(adapter: LLMAdapter): Seer {
  const seer = new Seer({
    adapter,
    profile: MARISOL_PROFILE,
    antechamberHistory: [],
    intention: 'Should I move back to Oakland for my mom?',
    drawn: drawForSpread(FOUR_CARD_DIAMOND),
    // Demo path: no Augur step. director's outcomes input is empty;
    // the actor's ride is anchored by the hand-authored MARISOL_INTRO
    // + prose brief. (TODO: hand-author 2 fixture outcomes so demo
    // beats have visions to surface, not just the choice draft.)
    outcomes: [],
    preferred_intro: MARISOL_INTRO,
  });
  // Force the fixture prose_brief into the Seer's internal state so all
  // subsequent per-card director calls have the rich Marisol context
  // (instead of the empty default the preferred_intro path leaves).
  (seer.getState().inputs as { prose_brief: string }).prose_brief = MARISOL_PROSE_BRIEF;
  return seer;
}
