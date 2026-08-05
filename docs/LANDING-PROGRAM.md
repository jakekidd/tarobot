# The Landing Program — plan + onboarding for the next agent

## Context

Three days of iteration built the oracle ensemble to a converged VOICE
(vesper) and an unconverged SYSTEM: across the six-session master
suite, the arc completed 1/6 — insight was manufactured and never
delivered. An external deep-analysis (jake's brainstorm chat) produced
"The Landing Program" — 8 experiments. This plan arbitrates that
program against the actual code (some claims verified, some stale —
the analysis is ONE BUILD BEHIND: it predates the beats-library
register rewrite, the beat-prompts-with-postconditions change, and
the mandate short-circuit), merges it with the two backlogged tasks
(exploration-on-timeout; injection hardening stays parked), and serves
as the ONBOARDING for a fresh session. jake will clear context and a
new agent executes from this document.

**Instruction to the executing agent: read Part I before Part II.**
The why outranks the what. Do not skip to the build order.

**First actions, in order:** (1) read this file whole; (2) read
`CLAUDE.md`, `docs/SESSION-V2.md`, `docs/ENSEMBLE.md`,
`docs/experiments/*.md`; (3) run `pnpm typecheck && pnpm
smoke:ensemble && pnpm smoke:booth` to confirm the build is green;
(4) close session Task #9 (subsumed by S1 here); (5) remind jake to
ROTATE THE API KEY in `.env.local` (it was pasted in a chat); (6)
start S0 (re-baseline) — and pre-register your predictions before the
run.

---

# PART I — first principles (the why; each law has a scar)

These were each learned from a real failure. When a change conflicts
with one of these, the law wins until jake overrules it.

1. **Mirror, not oracle.** The win condition is the visitor feeling
   SEEN, not the system appearing prescient. No advice, no verdicts,
   no predictions. The reading names the dilemma and leaves the choice
   theirs; the release line ("which way — that's yours. i don't pick.")
   is that law spoken aloud.
2. **A session that doesn't land didn't happen.** The naming spoken,
   the quest handed over, the close closed — the arc IS the product.
   Insight that never reaches the visitor's ears is inventory. (Scar:
   1/6 completion; a crier sat 13 turns and never saw a card.)
3. **Structure binds; prompts don't.** Goals and voice rules are
   suggestions the model will eventually ignore under pressure; what
   must hold, holds mechanically (menus that clamp, validated slots,
   mandates, counters). Scar: every prompt-layer fix that failed
   before the beat grammar existed.
4. **Example-becomes-script.** Any quotable line inside any prompt
   will eventually be spoken verbatim. Scar: "that's the third time
   you've said fine" (fabricated count = my own illustrative example);
   "tell me if that's not it" fossilized across three reads. Prompts
   teach shapes, never hand out scripts.
5. **The library anchor — and the two rut sources.** Authored beats
   enter the transcript as the persona's own prior speech — in-context
   few-shot stronger than her system prompt. The library must be
   written in her register or not at all; persona + library version
   together. Scar: middle-manager bones ("here's where i keep
   landing") grew middle-manager flesh. Extensions: (a) the VISITOR's
   lines sit in the same prefix — an articulate sim coaches vesper
   mid-session (measure via the contagion index); (b) some ruts are
   PRIOR-ruts, not prefix-ruts — "that's not nothing" recurred in
   places no transcript connected; that's Claude house style surfacing
   wherever a Claude authors text. Prefix-ruts → library rewrites.
   Prior-ruts → named negative examples + non-Claude authorship (jade
   for text; a different model family for sims).
6. **The guarantee lives in the postcondition, not the fixed text.**
   Voice-critical beats are PROMPTED (she speaks the function her way)
   and mechanically validated; authored lines are the fallback. Scar:
   the corporate register users are primed to detect.
7. **Synthesizer, not originator.** The model is superb at reducing
   what was said to a logline and terrible at inventing truths. The
   license ladder (clarify 0-1 → guess 2 → synthesize 3-4, fed by the
   evidence-derived familiarity meter) makes humility structural.
   Anti-Barnum is also structural: no commit → charm, never an
   invented fork; quotes exist only as verified substrings.
8. **Sycophancy is a persona-level property.** You displace it by
   installing a character whose repertoire lacks it, not by rules.
   Vesper is PREDICTED as a human ("what does she say next"), never
   instructed as an assistant; the goldilocks pass writes the chatbot
   take every beat precisely to not speak it. Scar: "good, that's a
   real correction" — chatbot grammar no mouth produces.
9. **Enemies-list metrics have two faces.** MELODRAMA / BARNUM /
   SELF-STATE / VALIDATION are subtraction metrics; optimizing them
   to zero sanded the PERSON off. Performed interiority stays banned;
   a lived exterior (opinions, textures, composite others) is
   character and is currently missing. You can't sculpt with only a
   delete key.
10. **The test must not subsidize the system.** A sim that holds the
    whole profile performs disclosure; a sim that shares the oracle's
    register co-authors the insight. Truth is held by the scorer only;
    the surface carries FACTS (scenes, nouns) but never the thesis;
    authorship of dossiers is separated from oracle-prompt context.
    Scar: six "different" visitors sharing one articulate em-dash
    voice; a sim that drifted into an invented romance.
11. **Instrument discipline.** Never change the system and the
    measuring stick in the same run; re-baseline after instrument
    changes; pre-register predicted metric movements before each eval
    run. When harder sims make numbers dip, the dip is truth arriving.
12. **The wince outranks the numbers.** jake reading a transcript cold
    is the final gate. Mechanical checks catch regressions; they do
    not certify quality.
14. **Co-authorship: the visitor makes the connection.** (jake,
    2026-08-05, extending the house under-specify principle.) The
    machine's cleverness lives in SELECTION, not statement: cognition
    picks which card symbolism resonates with the dilemma; the persona
    speaks the SYMBOL ("this card says death means peace"), never the
    mapping ("like your mom who died"). The visitor closes the circuit
    themselves — that self-made connection IS the breakthrough. A read
    that states the connection steals it.
13. **Working with jake:** honest tradeoffs, no overselling; propose
    and let him redirect — never grill with prerequisite questions;
    commit style `type(scope): lowercase one-liner`, no co-author
    trailer; NEVER push (push = deploy); text-shaped things live in
    `materials/` for non-coder editing; cut releases only when asked.

---

# PART II — current state (one build AHEAD of the analysis)

## the product

Boot: key entry → three-door menu (`src/ui/MainMenu.tsx`): **demo**
(the booth in 3d — `src/ui/booth/`: BoothStage pure state, BoothScene
three.js, deal-by-tapping deck, subtitles), **xray lab**
(`src/lab/xray/` — the debug surface: two composers incl. the cast-
visitor sim seat, card strip, copy-xray, inspector), **settings**. The
turtle/antechamber/seer world is DEAD CODE (banners on its docs). Both
demo and lab drive the SAME `EnsembleEngine` + telemetry and emit the
same `SessionRecord`.

## the engine (src/pipeline/ensemble/)

- `engine.ts` — the loop: menu computed per beat (structure binds;
  off-menu clamps; single-beat menus SHORT-CIRCUIT the driver call),
  V/T/F render paths, familiarity meter 0-4 → license ladder, guess
  cadence (3 questions → mandated guess; cold gates; warm re-guesses;
  divergence-checked alt), focus consent gate → EXPLORATION
  (mind-heart-root) on double-decline, augur feed (conjector sees all
  drawn faces; FORESIGHT-LEAK check 11 guards speech), op log (every
  algorithmic decision), naming ritual, quest/charm close.
- `beats.ts` + `materials/ensemble/beats.json` — the beat grammar +
  authored library (register law: written AS vesper).
- cast of six: driver (beat selector) / persona (VESPER,
  predict-a-human, goldilocks three-takes) / interpreter (reads +
  coherence 0-3) / profiler (14 facets + elevation) / conjector
  (hunt→classify→dilemma doc: problem/options/quest, focus phrases) /
  attention (the frame). prompts in `materials/prompts/ensemble/`.
- eval: `scripts/eval-run.ts` (two-layer obfuscated dossiers,
  surface-only sim, scored vs held-back truth), `check-session.ts`
  (11 mechanical checks), `live-table.ts` (inbox-driven live seat),
  `persona-lab.ts`, `render-xray.ts`.

Commands: `pnpm typecheck / lint / build / smoke:ensemble /
smoke:booth / check -- <session.json> / eval [-- --n --arch] / live /
persona-lab / xray:render`.

Docs (living): `docs/SESSION-V2.md` (the grammar + deltas),
`docs/ENSEMBLE.md`, `docs/experiments/{EVAL-METRICS,PERSONA-SEARCH,
NORTH-STAR}.md`. `CLAUDE.md` orients; turtle-era docs wear banners.

## CRITICAL: the analysis is one build behind

The Landing Program was written against the six-session master suite.
SINCE that suite, this landed (already committed): the beats library
register rewrite (middle-manager purge), **beat prompts with
postconditions** (focus offer/alt + charm are PROMPTED persona lines,
mechanically validated, library demoted to fallback), the mandate
short-circuit, de-metronomed incantations. So: the focus-gate WORDING
critique is largely addressed; the consent DETECTION bug is NOT (see
ledger). Re-baseline before believing any suite number.

## the verified defect ledger (all confirmed against code)

1. **Consent has no detector** — `engine.ts` ~601: driver picking
   `deal` after an offer logs "focus accepted" regardless of the
   visitor's words; two rejections can still read as consent; no
   evidence logged.
2. **No clock** — nothing in the engine forces landing; the only cap
   is the eval harness's 13 turns. Naming grace wobbles while
   conjector edits are in flight (mark persists; mandate stalls).
3. **Plant silently dropped** — exact-string id match vs kebab-case
   deck ids; DEAL note logs the REQUEST, never verifies delivery.
4. **Handle fossil** — "tell me if that's not it" quoted in
   `driver.md:42`, `engine.ts` ~1252 and ~1349 (example-becomes-script,
   third recurrence of this bug class).
5. **Template grammar** — CONCRETE double-"actually" (text AND
   fallback), KIND lacks conjugation guard, NOUN slots validate word
   count only.
6. **Guess length unenforced** — schema `.optional()`, no cap; spoken
   guesses ran 26-42 words.
7. **Edited-means-edited has no teeth** — verbatim passage overwrite,
   no diff/dedup (~7 duplicate emissions per session).
8. **Thoughts serialization** — `'["a","b"]'` inside a string passes
   as one blob; no JSON.parse attempt.
9. **Sim subsidy** — fixed articulate register, no length sampler, no
   silence ticks (hold fired 0/6), auto-flip cadence, no fidelity
   judge; obfuscator withholds FACTS along with the thesis (caused
   d5's invented romance).
10. **Instrumentation gaps** — no build/prompt hash, no per-beat
    familiarity/license, no consent evidence, no token/cost.
11. **Presence absent** — no almanac, no aside mechanism, nobody asks
    the visitor's name; vesper's life exists only in her prompt.
12. **Card-name tension** — she receives imagery/charge but is
    forbidden to name the card; best reads broke the rule.

Git: `main`, clean, **26 commits ahead of origin, UNPUSHED** (push =
deploy; never push without jake). API key sits in `.env.local`
(gitignored) — **jake said he'll rotate it; remind him.**

---

# PART III — the arbitrated program

Adopted from The Landing Program with corrections; E6 RATIFIED BY JAKE
(2026-08-05): the "no card names" law is REVERSED — every read must
carry one concrete card element (name or named visual detail from the
deck bible); lore dumps stay banned; BARNUM tripwire guards
imagery-as-filler. Session Task #9 is SUBSUMED by S1 below (close it);
Task #10 (injection hardening) stays parked until the primary use case
sings — then required before festival deploy.

## S0 — re-baseline (first working session)

Re-run the six existing dossiers on the CURRENT build (it is newer
than the analyzed suite), archive scoreboard + xray transcripts as the
baseline. Pre-register predictions before every eval run from here on
(write them in the experiment doc first; receipts beat memory).

## S1 — landing gear + hygiene + economy (vs FROZEN current sims)

**The clock (E0):** `BEATS_BUDGET` constant → `beats_remaining` in
snapshot + driver payload; ramp: T-6 landing advisory in GOALS; T-4
menu narrows (naming-if-committed or charm becomes the only large
beat) — the charm is the floor, never an invented fork (this subsumes
exploration-on-timeout from Task #9); T-2 quest mandated; T-1 close
mandated. `flush()` on visitor-side termination speaks the compressed
landing anyway. Naming grace converts to mandate on expiry (fix the
in-flight wobble: mandate persists; speaking still waits out an
in-flight conjector edit).

**The consent detector:** after a focus offer, the next visitor line
gets a mechanical verdict (fast-tier yes/no/ambivalent classification)
logged WITH its evidence quote; `deal` is illegal without verdict=yes;
two non-yes → exploration; a "no" feeds the conjector as a cold grade
on that territory (Task #9's refinement).

**Gate the already-landed S1-tier changes:** the library register
rewrite, beat-prompts-with-postconditions (focus/charm), and the
mandate short-circuit shipped after the analyzed suite — they get
gated HERE, with the clock, against frozen sims, so there is exactly
ONE re-baseline before the sim swap.

**The register seams (replaces skeleton-proofing):** don't build
fill-proof machinery for beats about to stop being skeletons. Convert
the QUESTION FRAMES to beat prompts (kills the conjugation bug class
— "who carry", double-"actually" — by construction), and re-voice the
NAMING passages: the persona re-speaks the conjector's memo in her
mouth, with the passage contract as validator (mechanism named, their
words present, both costs, no recommendation) and the authored passage
as fallback ("the mechanism is competence itself" is analyst voice
wearing her lowercase). Beat prompts run THROUGH the goldilocks
contract, with the RETIRED library lines wired in as the named
too_safe corpses ("here's where i keep landing…" written every beat
in order to not be spoken — the manager corpse, same trick that
killed the mystic). Validators check FUNCTION, not punctuation: the
focus question's postcondition is REFUSABILITY (could a stranger
comfortably say no) via a fast-tier check, not a regex hunting "?".

**Hygiene (E5, trimmed):** conjector guesses ≤22 words enforced at
filing (reject → "shorter, one breath" retry; loosen to 26 only if
warm-by-guess-two falls); the handle fossil deleted from all three
ensemble-path sites (`driver.md:42`, `engine.ts` ~1252, ~1349),
replaced by an authored 8-handle rotation in beats.json
(within-session repeat = new check); **fossil law**: quoted example
lines in ANY prompt — including beat-prompt phrasings — are extracted
to a never-say-verbatim list checked mechanically.

**Economy + chores (E7):** passage diff-dedup (near-identical
re-emissions dropped + counted); post-commit document cycles
rate-limited except on S3's reopen trigger; profiler pronoun
discipline ("they" until given); thoughts JSON.parse attempt; plant
fixed (kebab-case coercion + verify-in-drawn + honest delivery log).

**Instrumentation (§10, lands with S1):** build hash (git rev +
materials/ content hash) in SessionRecord; familiarity/license stamped
per beat; consent verdicts + evidence in op log; beats_remaining
logged; token/cost per call if the adapter exposes usage; delivery
annotations (`[dry]` `[pause-before]` — persona-optional, stripped
from rendered text, kept in the log); per-session check results
appended to xray.txt; **FALLBACK RATE per beat type** (a fallback
line is authored text entering the transcript — a miscalibrated
validator rebuilds the metronome from its own safety net; target
<10%, alarm at 20%); **validator pass-rate per beat type**; **the
contagion index** (distinctive n-gram + punctuation-habit overlap
between oracle and visitor lines within a session — pre-register the
prediction that vesper's free-beat register shifts when sim voices
change in S2).

**GATE:** arc completion, naming-or-charm, quest, close = 6/6 on the
frozen six; zero grammar breaks; guess p95 ≤22 (loosen to 26 only if
warm-by-guess-two hit rate falls); endings pass a wince read.

## S2 — sim v3, alone (instrument change; then RE-BASELINE)

Dossier spec: the surface MUST carry the mechanism's concrete FACTS as
scenes and nouns and MUST NOT carry the analysis or class (facts
prevent invention; missing thesis prevents announcement). Per-dossier
voice card (median words/turn, filler quota, fragment rate, banned
constructions — the shared em-dash hedge dies). Length sampler (median
~12 words, real 1-3 word tails, occasional rant; sim must land ±30%).
Silence: sim may emit a tick instead of words (finally exercises
`hold` and `flip_invite`). Post-hoc fidelity judge: played concretes ⊆
dossier concretes, deployment log of samples/decoys used. Authorship
separation stays law (fresh agent context authors dossiers; different
model family for the sim if practical). Three new low-articulacy
dossiers (monosyllabic deflector, drunk rambler, meta-skeptic).
**GATE:** sim panel green; re-baseline the S1 build on v3 sims — all
later comparisons run against THIS baseline. If oracle metrics crater,
that is the finding; do not soften the sims.

## S3 — sweep + second look

**Breadth (E1):** SWEEP beat (authored T, 3 variants: "that's one
room. what else is taking up space right now — anything, even
sideways?"); driver guidance: once before half the question budget,
and whenever one territory absorbs 3+ consecutive questions. Coverage
gate: CLASSIFY rejected by the engine until territories-probed ≥2 OR
sweep-declined. Classify must carry a one-sentence disconfirmation
(the strongest alternative territory it rejects, and why).

**Post-commit vigilance (E2):** interpreter two-hypothesis rule — a
post-commit visitor line with a NEW concrete (person/debt/place/
number) must state both (a) deflection and (b) the thesis was wrong/
incomplete; a (b) above threshold forces a conjector reopen cycle
("overturning is legal and cheap; defending needs evidence"); revised
naming may fire if the original hasn't spoken; doc revisions capped at
2 post-commit. **GATE:** withheld-fact surfacing ≥2/3 on armed
dossiers; late-truth revision ≥2/3; ground-truth-as-decoy labels = 0;
class recovery ≥4/6 on the nine-dossier suite; intake must not blow
the clock.

## S4 — presence + dress code

**Presence (E3):** `materials/persona/almanac.md` (25-40 entries:
opinions / textures / composite others — invented composites legal
ONLY as her stories, never claims about this visitor; v0 text pending
jade). New `aside` beat: FREE, cap 18 words, budget 1-3/session,
illegal within 2 beats after cue=honor and everywhere at coherence ≤1.
The name: asked once in greeting/first tissue, used ≤2× after. Humor
license line in vesper's card (bartender-observational, never at the
visitor's expense at a heavy moment). The two-faces law from Part I §9
governs: SELF-STATE (performed interiority) stays 0 while PRESENCE
(lived exterior) reaches 2-4/session.

**Dress code + THE AUGUR (E6 as ratified + jake's oblique-read
mechanic):** remove the "no card names" line from wildcard.md; every
read carries one concrete card element (name or named bible detail);
DRESSING check ≥90%; BARNUM must stay flat or the element is being
gamed. And the read pipeline gains **the augur**: an event-triggered
cognition call (not a new per-tick chair) that fires at deal time —
faces are known then, so this is LATENCY-FREE — and again when the
dilemma document revises. Per face-down card it pre-writes a READ
BRIEF: which deck-bible details to feature ("this is what your bible
says about this card"), the symbolic statement to make, and the
NEVER-SAY — the explicit mapping to the visitor's life. The encoding
is in the SELECTION (law 14): the brief chooses death-means-peace
BECAUSE of the grief in the room, but the mapping stays backstage. On
flip, the persona voices the brief (one normal persona call — "here's
the speech you had planned"; same latency as today's read). Mechanical
proxy for obliqueness: the spoken read must not contain the
problem_md's distinctive nouns (extends FORESIGHT-LEAK's machinery);
the transcript should read like the card was a launching-off point
the visitor jumped from.
**GATE:** blind A/B (almanac on/off) reads as "someone is there" with
no wince increase; dressing ≥90%; oblique check green; at least one
frozen-sim transcript where the VISITOR states the connection
unprompted.

**FINAL GATE:** jake reads two transcripts cold — the best and worst
of the last sweep, chosen honestly. The wince count outranks every
number.

## the intent engine's destination (standing direction, not a stage)

The driver's decision has three layers: WHEN/WHAT (which beat — going
fully algorithmic: short-circuit, cadence, clock, coverage gates),
AIM (where to point it), and HOW (the persona's). The endgame is not
a new agent: the driver erodes into an AIMER whose only job is
judgment rules can't hold (which thread, which target, whether the
room says wait). Every judgment that recurs identically in
transcripts becomes a rule and a deleted model call. Pre-registered
side effect: aiming is cheaper cognition than intent composition, so
the parked fast-tier driver A/B grows MORE likely to pass with each
extraction — run it after the erosion settles (post-S3), not before.

## the delphi direction (parked; half-baked by design — do not build)

jake's Barnum counter for a later round: recast the persona from
"witch doing tarot" (triggers the performer attractor) to the ANCIENT
oracle — Delphi, Nekyia, the bicameral-mind resonance. The resonance
is real and already in the walls: the cognition/persona split IS a
voice arriving from offstage that the speaker doesn't fully see (the
original CLAUDE.md said it years-of-iterations ago: "the Seer is a
medium; the director is what she channels"). Named danger: "i am an
oracle" collapses into i-know-everything — it must be a HUMBLE shaman.
The hard problem jake names: telling a model it's fallible makes it
dumber; telling it it's capable makes it overconfident. Proposed
resolution to pressure-test when this bakes: locate fallibility in
the CHANNEL, not the person — she is a medium, not a knower; "the
signal is real; the reception is partial." Received things are
inherently garbled, so humility is structural fact, not
self-deprecation, and capability stays intact (transmission is her
claim, not omniscience). The license ladder already implements
earned-certainty; this would be its mythology. Historical footnote
worth mining: at Delphi the Pythia spoke RAW and the prophetai
interpreted — the split inverted. Explore via a persona-lab breadth
round (same harness as the vesper search), pressure-tested with the
brainstorm chat, ONLY after this program's gates are green.

## untouched, by design

The beat grammar core. The cast of six. Vesper's predict-a-human
casting + three takes. The license ladder (logged, not changed). The
focus gate's existence (it gains a detector, not a redesign). The
anti-Barnum law. Injection hardening (Task #10, parked). The booth
two-device split (mac mini monitor + iPad over one session) — jake's
festival architecture, discuss when he raises it.

## verification protocol (every stage)

`pnpm typecheck && pnpm lint && pnpm build` + `smoke:ensemble` +
`smoke:booth` green; stage's eval sweep run with pre-registered
predictions; `pnpm check` gates per session; xray transcripts
regenerated for jake (`pnpm xray:render`; master-file format:
`runs/MASTER-SESSIONS.txt` — GROUND TRUTH → PLAYED SURFACE → OUTCOME →
FULL XRAY per session, `═══` separators); commit per stage in jake's
style; never push.
