// Synthetic v2 Person record for the "LOAD DEMO" path. Lets the user
// skip the 12+ pillar survey and jump straight to the intention
// prompt with a plausible profile + LivingDoc already populated.
//
// This is fabricated data — not from a real walkthrough. The intent
// is exercise the reading + the visitor's silly-alien voice without
// burning credits on a fresh survey. The reading itself (Augur +
// Seer construction) still hits the API when the user submits the
// intention, but that's ~3-5 calls instead of ~20.

import { computeAstroProfile, parseBirthDate } from './pipeline/astrology';
import type { Person } from './storage';
import { PERSON_SCHEMA_VERSION } from './storage';
import type { LivingDoc } from './pipeline/survey';

/** Build a fresh demo Person each call (id + timestamps regenerated
 *  so the LOAD path doesn't collide with a prior demo). The profile
 *  is a textured snapshot of someone standing at a stay/go fork —
 *  enough scaffold for the seer to read against, leaning present-
 *  tense, with a held probe or two for the closing risky-swing. */
export function makeDemoPerson(): Person {
  const birthday = parseBirthDate('1995-10-10')!;
  const astro = computeAstroProfile(birthday);
  const now = Date.now();
  const id = `demo_${now.toString(36)}`;

  const doc: LivingDoc = {
    v: 18,
    scaffold: {
      leading_hypothesis:
        'jake performs rationality as armor — the "mind-led" self-image is policing access to the heart-led truth underneath, and the cost of the performance has started to show in the latency on the questions where the armor matters most.',
      axes: {
        self:
          'mind-led on Q5 (532ms — settled identity), but "as the role i play" on Q8 was the more honest answer (1254ms, deliberated). the rationalist self-image is curated; the performance has a noticeable cost.',
        tensions:
          'Q5 (decision style = mind) vs Q12 (life lacks meaning) — the rationalist frame has emptied out the meaning channel. mind without heart explains why his rationality feels hollow even to him.',
        history:
          'four-month latency on Q6 ("relationship to spiritual" — picked searching after 230s) is the loudest data point. someone who has left a frame and not arrived at one. probably raised in something he stopped believing in his early twenties.',
        relational:
          'parent (jeff) named as most important person — at 28, single, no partner mentioned. the parental bond may be displacing peer/partner intimacy. not a problem, just a shape worth naming.',
        joys:
          'pride/shame node = "how hard i work" (Q16). productivity is identity. the praise he wants is the praise he half-believes he doesn\'t deserve.',
      },
      cast_notes: {
        jeff:
          'father figure, load-bearing. the role jake plays (competent / measured / mind-led) is calibrated to jeff\'s gaze. unclear if jeff has actually demanded this or if jake has assumed it.',
      },
      fork: {
        a: 'name what the work is costing and let the rationalist self-image soften',
        b: 'continue the performance, accept the meaning-deficit as the price of being legible to himself',
        is_stasis: true,
      },
      tells: [
        '230s on "skeptic" (z=3.1) — held against pressure; wanted "searching", couldn\'t commit',
        '48s on "not sure" for the alt-life question — under-imagined or actively avoiding',
        '475ms on "a person" for what-do-you-protect — pre-loaded answer, probably jeff',
      ],
      temporal_lean: 'present',
    },
    margin: [
      'q1 (name) → "jake" fast, no hesitation — comfortable being known',
      'q4 (intent) → blank — diagnostic non-answer, came without a stated question',
      'q5 (decisions) → "mind" 532ms, performance-tinged',
      'q6 (spiritual) → "searching" 501ms after a 230s pause that was probably "skeptic" being rejected',
      'q8 (key person) → jeff (parent) — 747ms, pre-loaded',
      'q9 (perceived as) → "the role i play" 1254ms — bracing self-awareness, not defensive',
      'q12 (lacks) → "meaning" 1221ms — the wisdom-meaning gap is the live wound',
      'q14 (protects) → "a person" 475ms — see q8',
      'q16 (proud/ashamed) → "how hard i work" 1438ms — the productivity-as-worth node',
      'q17 (alt-life) → "not sure" 48677ms — under-imagined',
      'q18 (geographic) → "no, but i stay" 1217ms — geographic mismatch, anchored by something',
    ],
    story: {
      fork: {
        a: 'name what the work is costing and let the rationalist self-image soften',
        b: 'continue the performance, accept the meaning-deficit as the price of being legible to himself',
        is_stasis: true,
      },
      present_pressure:
        'the gap between perceived self (the role he plays) and lived self has begun to register as meaning-deficit. work, which has been the load-bearing identity, no longer fills the gap.',
      past_root:
        'left an originating frame (probably religious or family-shaped) and never arrived at a replacement. the rationalist self-image was the scaffolding built in the absence of one.',
      stakes: {
        on_a: 'on softening the rationalist self-image: jake gains access to the meaning he is currently starved of, but loses the legibility (to himself, to jeff) that the role provided. the version of himself that gets affirmation goes quiet for a while.',
        on_b: 'on continuing the performance: stability holds, but the meaning-deficit deepens until something breaks it for him (loss, health, relationship). the choice is being made by inertia.',
      },
      hooks: [
        'jeff',
        'the role i play',
        'no, but i stay',
        'how hard i work',
        'searching',
      ],
    },
    held: [
      {
        id: 'p_meaning_path',
        claim:
          'the meaning-deficit is vocational, not relational — the work itself, not the absence of partnership, is the load-bearing problem',
        source: 'detective',
        born_turn: 7,
        age_in_turns: 5,
      },
      {
        id: 'p_jeff_audience',
        claim:
          'the role jake plays is calibrated to jeff specifically; jeff is the audience the shape was cut for',
        source: 'detective',
        born_turn: 4,
        age_in_turns: 8,
      },
    ],
    coverage: {
      temporal_lean: { confidence: 0.78, contention: 0, gap: 0.22, sources: [] },
      fork: { confidence: 0.7, contention: 0, gap: 0.3, sources: [] },
      self: { confidence: 0.82, contention: 0.3, gap: 0.18, sources: ['q5', 'q9', 'q12'] },
      tensions: { confidence: 0.71, contention: 0.4, gap: 0.29, sources: ['q5', 'q12'] },
      history: { confidence: 0.65, contention: 0, gap: 0.35, sources: ['q6'] },
      relational: { confidence: 0.6, contention: 0, gap: 0.4, sources: ['q8', 'q14'] },
      joys: { confidence: 0.55, contention: 0, gap: 0.45, sources: ['q16'] },
    },
  };

  return {
    id,
    schema_version: PERSON_SCHEMA_VERSION,
    name: 'jake',
    profile: {
      name: 'jake',
      birthday,
      sun_sign: astro.sunSign,
      life_path: astro.lifePath,
      birth_card: {
        number: astro.tarotBirthCard.number,
        name: astro.tarotBirthCard.name,
      },
      age_bracket: '25-34',
      birth_time_bracket: 'afternoon_evening',
      relationship_status: 'single',
      // Pre-baked intention — the user can edit it at the
      // IntentConfirm UI or just confirm to go straight to the reading.
      initial_intention: 'should i stay where i am or break for something new?',
      cast: [
        {
          label: 'jeff',
          likely_role: 'parent',
          supporting_picks: ['key_person'],
          confidence: 'high',
          off_limits: false,
          pronouns: { subjective: 'he', objective: 'him' },
          color: '#ef4444',
          notes:
            'father figure, load-bearing. role jake plays is calibrated to jeff\'s gaze.',
        },
      ],
    },
    doc,
    picks_log: [
      mkPick('name', 'what should i call you?', 'jake', 2284),
      mkPick('birthday', 'when were you born?', '1995-10-10', 2292),
      mkPick('relationship', 'how would you describe your relationship status?', 'single', 1330),
      mkPick('intent', 'do you have a question for the cards?', '', 1089),
      mkPick('have-you-done-this-before', 'have you done this before?', 'sort of', 447, [
        'yes — i read tarot', 'yes — i\'ve had readings', 'sort of', 'never',
      ]),
      mkPick('whats-your-relationship-to-the-spiritual', "what's your relationship to the spiritual?", 'searching', 501, [
        'skeptic', 'spiritual', 'searching',
      ]),
      mkPick('how-do-you-make-decisions', 'how do you make decisions?', 'mind', 532, [
        'mind', 'heart', 'gut',
      ]),
      mkPick('who-is-the-most-important-person-in-your-life', 'who is the most important person in your life?',
        JSON.stringify({ category: 'parent', name: 'jeff', off_limits: false, color: '#ef4444' }), 747),
      mkPick('how-do-you-think-others-perceive-you', 'how do you think others perceive you?', 'as the role i play', 1254, [
        'too much', 'not enough', 'as the role i play', 'misunderstood', 'more put together than i am', "i've stopped checking",
      ]),
      mkPick('which-of-these-do-you-value-most', 'which of these do you value most?', 'wisdom', 999, [
        'love', 'freedom', 'wisdom', 'beauty', 'security', 'power',
      ]),
      mkPick('which-one-is-your-question-right-now', 'which one is your question right now?', 'fit', 924, [
        'risk | hold', 'stay | go', 'fit | break', 'continue | change',
      ]),
      mkPick('the-thing-youre-most-proud-of-and-most-ashamed-of', "the thing you're most proud of and most ashamed of might be the same thing.", 'how hard i work', 1438, [
        'how much i give', 'how much i hold back', 'how hard i work', 'how much i need',
      ]),
      mkPick('does-where-you-live-feel-right', 'does where you live feel right?', 'no, but i stay', 1217, [
        'yes', 'for now', 'no, but i stay',
      ]),
    ],
    timing_log: [],
    anchor: '',
    verbatim_log: [],
    intentions: [],
    created_at: now,
    last_visit_at: now,
  };
}

function mkPick(
  node_id: string,
  question_text: string,
  answer: string,
  latency_ms: number,
  options_shown: string[] = [],
): Person['picks_log'][number] {
  return {
    node_id,
    question_text,
    options_shown,
    answer,
    answered_at: Date.now(),
    latency_ms,
    prompted_by: null,
    is_engine_authored: false,
  };
}
