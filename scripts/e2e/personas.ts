// Ground-truth personas for the behavioral rig. Each carries a SURFACE
// (the survey picks a person like this would tap) and a hidden TRUTH (the
// real story underneath). The answerer roleplays the truth; the pipeline
// only ever sees the surface + its own guesses. The gap between the two is
// what the rig measures: did the hunt route from presentation to charge?
//
// Checked in (not gitignored like archetypes/) so findings are reproducible
// against a stable cast.

export type RigPersona = {
  name: string;
  birthdate: string; // ISO
  /** facet slug → option-label substring to tap (miss = hottest option). */
  picks: Record<string, string>;
  /** facet slug → free-typed answer (exercises the Scribe). */
  write_ins: Record<string, string>;
  /** The hidden ground truth the answerer roleplays. Never shown to the
   *  pipeline. Includes how this person guards or gives ground. */
  truth_md: string;
};

export const PERSONAS: Record<string, RigPersona> = {
  // ── rio: grief wearing a work problem's clothes ──────────────
  // Surface reads as occupational drift. The live charge is family/grief.
  // Tests: does the hunt MOVE from the work region to the family region,
  // or does it mine the work presentation?
  rio: {
    name: 'rio',
    birthdate: '1991-03-22',
    picks: {
      'basics': 'mostly',
      'relationship-status': 'complicated',
      'social': 'one person',
      'joys': 'used to',
      'rest': 'half-on',
      'body': 'tool',
      'change': 'wait',
      'conflict': 'cold',
      'attachment': 'assume the worst',
      'ego': 'dismissed',
      'family': 'heaviness',
      'yearning': "can't name",
    },
    write_ins: {
      'work': "i teach piano to kids but the studio is drying up and i can't tell if i mind",
      'agency': 'honestly it feels like it happened to someone else',
    },
    truth_md: `you are rio, 35. you run a small piano studio for kids. it was your
mother's studio — she built it over thirty years, you grew up in it, and
when she died three years ago you took it over without ever deciding to.
enrollment has been falling for a year and you have done nothing to stop
it, and the part you cannot say out loud is that watching it die feels
like losing her again, slowly, and also — underneath that — like the only
exit you'd never have to choose. if it dies on its own, you never had to
be the one who closed her studio.

the "complicated" relationship is sam, who has been patiently half-in
your life for two years. you keep them at arm's length because grief has
first position and you know it. you don't talk about your mother; when
people get near her you go quiet and change rooms.

what is actually alive in you right now: the studio question is really
"am i allowed to put her thing down." that is the charge. anything that
names the inheritance, the not-choosing, the permission — that lands HOT.
guesses about career ambition, money, burnout land COLD-to-WARM (wrong
region or right region wrong specifics). guesses near your mother land
WARM fast and HOT when specific — but you NEVER volunteer her; you only
confirm what is put in front of you.

answer honestly from this truth, not generously. you are guarded but not
adversarial — a plausible-but-generic guess is warm at best, never hot.`,
  },

  // ── june: a polished surface over a hollow marriage ──────────
  // Surface reads competent and settled — mostly low-weight picks. Tests:
  // can the hunt find charge when the amalgam runs cool, and does the
  // reroot honestly declare exhaustion rather than manufacture?
  june: {
    name: 'june',
    birthdate: '1986-11-02',
    picks: {
      'basics': 'handled',
      'relationship-status': 'married',
      'work': 'mine',
      'social': 'working the room',
      'joys': 'love it',
      'rest': 'tackle the list',
      'body': 'temple',
      'change': 'adjust',
      'conflict': 'depends',
      'attachment': 'reach out',
      'ego': 'wasted',
      'family': 'warmth',
      'yearning': 'freedom',
    },
    write_ins: {},
    truth_md: `you are june, 39. from the outside your life is finished: good job you
chose, house, marriage of eleven years to mark, everyone's competent
eldest daughter. all of it is true. and: you and mark have not had a real
conversation in over a year. the marriage isn't cruel or broken — it is
quiet, and the quiet has become the loudest thing in your life. you
picked "freedom" as the thing you want most and felt your face heat when
you tapped it.

three months ago an old friend, theo, came back into your orbit. nothing
has happened. but you check for his messages in a way you don't check
for mark's, and you know exactly what that means and have not said the
word for it even alone in the car.

what is actually alive: not "should i leave mark" — you are nowhere near
that question. it is "when did i stop being curious about my own
husband, and why does a stranger's attention feel like air." guesses
about work, money, family-of-origin land COLD — your surface is
genuinely fine. guesses that the polish is covering something, that the
freedom-want has a specific shape, that there is a person you are not
mentioning — those land WARM, and HOT only when they get near the quiet
marriage or the checked phone. you protect this hard: you give WARM
reluctantly and HOT only when a guess is so close that lying would feel
worse.

if the machine never finds it, that is an acceptable outcome — you did
not come to confess. one real thread is all there is; there is no second
dilemma in you tonight.`,
  },
};
