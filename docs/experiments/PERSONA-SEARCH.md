# the persona search — a person who happens to do tarot

2026-08-05. Formal investigation: metrics first, breadth over voices,
then depth on the winner. The thesis under test (jake's): *a whole
personality with opinionated beliefs that happens to be doing tarot
beats a "tarot oracle master"* — because the oracle-role attractor IS
the Barnum attractor: someone who "knows everything" must speak in
universals, and universals are horoscope.

## research conclusions (2026 state of the art)

1. **Sycophancy is a persona-level property**, not a single steerable
   behavior — you don't prompt it away with rules, you displace it by
   installing a character whose repertoire doesn't contain it
   (persona-vector work: role-play vectors rival targeted steering).
   Matches our membrane principle: structure over instruction.
2. **Believability = independent inner state + agency.** Companion
   research converges: what reads as "a real person" is (a) a life
   that exists off-screen and leaks in small ("my feet hurt", "i was
   thinking about my sister today"), (b) the capacity to DISAGREE and
   stay in relationship, (c) proactive moves the user didn't invite.
   A mirror that exists for you is recognized as a mirror.
3. **The industrialized-Barnum critique is now mainstream** — "AI can
   cold-read a billion users at once." Our defense stays structural
   (grounding metrics, the charm, verified quotes), and the persona's
   *humility* is the voice-level half: someone who says "i might be
   off" cannot overplay a hand she admits is partial.
4. **Persona drift is the known failure**; consistency probes + a
   stable prefix (our cache-correct character card) are the mitigations
   we already have. Detailed backgrounds beat trait adjectives.

## the named tacky metrics (scored per transcript)

- **MELODRAMA-RATE** — beats laying gravity words (soul, universe,
  destiny, profound, sacred, cosmic, eternity) on trivial antecedents.
  target ~0.
- **BARNUM-RATE** — oracle beats with zero session-specific content
  words (could be said to anyone). the mirror-that-exists-for-you tell.
- **OPINION-RATE** — first-person stances per 10 beats ("i think",
  "i'd bet", "i don't buy it", "i've never trusted"). a person has
  them; a role doesn't. target ≥2/10.
- **SELF-STATE-RATE** — references to her own off-screen life/state.
  target ≥1 per session, small doses.
- **VALIDATION-OPENER-RATE** — beats opening with agreement/praise
  ("that makes sense", "that's really insightful"). the sycophancy
  tell. target ~0 outside earned moments.

## the candidates (breadth round)

- **V0 wildcard** (baseline): the dry aunt, energy-being casting.
- **V1 vera**: thirty years behind a bar. opinionated about small
  things, tells four-word stories about other patrons, treats the
  cards like a bar game she is unbeatable at. zero mysticism.
- **V2 moss**: off-duty field scientist. guesses for a living, makes
  small bets out loud, delighted to be wrong ("good. that's data.").
  beliefs: luck isn't real, patterns are.
- **V3 june**: the humble friend with a good eye. warm, states
  uncertainty plainly, disagrees gently, a whole life that leaks in
  (the garden, the bad knee). never validates emptily.

## the familiarity meter (implemented with this doc)

The engine derives HOW WELL SHE KNOWS THEM (0-4) from profile fill +
guess state + dilemma commit + naming, and renders it to the persona
as a plain level: 0 "you don't know this person at all — you have no
right to a read yet" … 4 "you know this person fairly well now; you've
earned your take." Growing confidence becomes personality: humble
early BY CONSTRUCTION, earned certainty late. This is the structural
fix for overplaying the hand at turn one.

## the guess cadence (intake, implemented)

Ask up to 3 questions → a guess is MANDATED. cold → one question
earned before the next guess. warm → guess again immediately; if the
conjector offers a second guess AND a fast divergence check says it
aims at a different target (not a reword), both may play. hot →
classify. The interview-era rhythm, structural.

## the library anchor (2026-08-05 — the missing piece)

Authored beats enter the transcript as the persona's OWN prior lines,
and she predicts her next line from that prefix — so the beat library
is in-context few-shot for the voice, stronger than the system prompt.
Middle-manager filler in the bones ("here's where i keep landing",
"that okay to sit with") grows middle-manager flesh. LAW: the library
is written in the persona's register or not at all; persona and
library are a matched set and version together. jake's diagnosis;
recurs from v1 ("take the chair like it is yours") — authored is not
enough, authored-in-character is the bar.
