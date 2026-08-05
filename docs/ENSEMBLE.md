# the oracle ensemble — reading engine + xray lab

Living truth for `src/pipeline/ensemble/` and `src/lab/xray/`. When this
doc and the code disagree, the code wins; fix the doc. **Session flow,
delivery, and testing live in `docs/SESSION-V2.md` (the beat grammar) —
that document supersedes this one's arc sections.** `ENSEMBLE-PLAN.md`
(repo root) is the build plan that produced this system — mine it for
rationale, treat it as historical.

Ordering rule for this file: the top is universal (safe to build on),
the bottom is brittle (point-in-time findings, tuning state). When a
bottom section rots, delete it rather than patch it.

---

## 1. what this is

The ensemble is the live reading engine: the cluster of agents that
runs a four-card session between the oracle (the wildcard) and a
visitor who sits down BLIND — no intake, no brief, no upstream
pipeline. The engine draws its own cards; everything it knows, it
learns in the room. (Chat mode survives as a lab probe only.)

**The thesis.** Two claims, made literal as architecture:

1. *Good tarot names a dilemma.* When a reading is actually useful, it
   takes your noise and hands back the problem and the fork, better
   verbalized than you could — then leaves the choice yours. The
   conjector IS this claim: guess → grade → the dilemma document
   (problem / options / quest), delivered as the naming and the
   questgiver close.
2. *Psychic is a hidden channel plus inference.* Everything that reads
   as supernatural is attention to signal the visitor doesn't know
   they're emitting — word choice, dodges, what they repeat, what they
   correct, what they laugh off. The interpreter and profiler ARE this
   channel; the cards are constraint noise that forces a specific
   angle and licenses saying it out loud.

The wager: eerie accuracy with no trick beyond listening, usefulness
with no advice — the visitor leaves with their choice named and a
quest to test it. The win condition is still feeling SEEN, by
something that demonstrably was paying attention.

Naming: the character is **the oracle** (renamed from "the seer",
2026-07-24). The legacy director/actor engine at `src/pipeline/seer/`
keeps its old name until it is retired; `src/pipeline/oracle/` is the
single-voice baseline arm, which always carried the character's name.

The benchmark is explicit: the ensemble must beat (a) naive single
inference and (b) the single-voice baseline (`src/pipeline/oracle/`) on
real transcripts, blind-ranked. Until it does, the honest product is the
baseline. Both are kept runnable for exactly this reason.

The register is the house register: mirror, not prophecy. The oracle never
advises, predicts, or delivers verdicts. The win condition is the
visitor feeling seen — and the smartest the system ever gets is from
material the visitor provides, so the engine is tuned to return the
floor.

## 2. load-bearing principles

Most durable first. Every mechanism below §3 is downstream of one of
these.

1. **Two tracks, one membrane.** BEHAVIOR (the hot path: blocking,
   serialized — driver decides, persona speaks) and COGNITION
   (everything async — the fan, attention). Cognition judges and never
   speaks; the persona speaks and never judges. The only crossings:
   the frame (standing orientation), the intent (per-beat assignment),
   and ammo (one licensed verbatim sentence).
   This is the structural defense against sycophancy — the half that
   decides what is true never faces the visitor, so it has nothing to
   soften for. It holds by topology, not by prompt.
2. **Hindsight, not gating.** No model call sits between the visitor's
   line and the driver. Cognition enriches the NEXT beat. (The v1
   stall — a brake beat while cognition caught up — died with the beat
   grammar: it never fired live, and question/tissue beats do its job.)
3. **Persistence by recurrence.** No decay timers anywhere. Consumers
   see pile tails; an agent keeps something alive by refiling it;
   durable insight survives by promotion into the frame. Memory tiers:
   tails are sensory memory, the frame is working memory, the piles +
   scroll are the record.
4. **Economy as pacing, not permission.** The word budget sizes lines;
   it never gates whether she may speak. A visitor who underfeeds gets
   an oracle licensed to carry the room.
5. **Cache correctness.** The persona's context prefix (character card,
   then beats) is append-only and never edited. Everything volatile
   (frame, intent) rides after it. This is the prod local-serving
   budget (RadixAttention-style prefix reuse on small hardware); the
   lab does not exercise it but must not break the ordering.
6. **Charge over truth, texture beats biography** — inherited from the
   house principles (`CLAUDE.md`). A wrong guess that provokes a
   correction beats a right fact that sits inert; never prove facts
   back at the visitor.
7. **Headless = web.** The engine is Node-portable (no DOM, no timers —
   the caller owns the silence clock). The xray lab and the e2e runner
   are two frontends over the same `EnsembleEngine` + telemetry
   interface, and both emit the same `SessionRecord`. A terminal
   session and a browser session are interchangeable evidence.

## 3. state

Four objects; everything else is derivation. Shapes live in
`src/pipeline/ensemble/types.ts` (the truth — don't trust this doc for
field lists).

- **The scroll** — the pure record: beats (spoken lines) and events
  (open/flip/silence/close), append-only, nothing cognitive. Turns are
  derived (count of oracle speech commits), not stored.
- **The piles** — cognition's output, detached from the scroll. Every
  item is anchored to what its agent was reading. Refiling
  (`refreshes: id`) moves content to the tail; what stops being refiled
  slides out of every model's view but never out of the record.
  Alongside the piles: the PROFILE (14 facets, filled freeform by the
  profiler) and the DILEMMA DOCUMENT (the conjector's problem /
  options / quest passages) — both grow monotonically, both are
  consumed by the driver and attention.
- **The frame** — the oracle's orientation, markdown, regenerated whole
  by attention (focus / dressings / stance / carried / prohibitions).
  Versioned; models only ever see the current one. Frame v1 is
  assembled deterministically from the input at start — no call, no
  latency.
- **The economy** — budget (fills sub-linearly by listening, empties by
  speaking, flips buy room to read), talk ratio, carry flag.

Input is `EnsembleInput { mode, docs, scenario, greeting?, taboos }`:

- **docs** — markdown intake documents about the visitor, the
  experimental input channel. Managed in the lab (localStorage), fed
  verbatim to the driver and attention, never the persona.
- **greeting** — the screenwritten opening speech
  (`materials/ensemble/greeting-{chat,session}.md`), spoken verbatim as
  the first beats: no model call, no budget spend, no invented facts.
  The opening is where an unfounded generated line costs the most (live
  finding: "they have been waiting this long"). One beat per paragraph;
  `{{name}}`-carrying lines drop when no name is known; html comments
  are authoring notes (the disclaimers slot lives there, empty for
  now). Personalization is slot-filling, never invention — mad-libs
  blanks beyond the name are a future step.
- **scenario** — turn 0's given circumstances. Drives the opening
  through the hot path ONLY when the greeting is empty (the old way,
  kept as fallback and for auto-runs that want a generated open).
- (the OracleBrief is GONE from this engine — the four cards are drawn
  by the engine itself from the Deck Bible at construction; the quest
  replaces the mantra; the profile replaces the intake.)

**Stages (the train line).** Where the session is on its line is
DERIVED from the scroll and flips (`stages.ts`), never model-decided:
session runs `opening → table → card_1..4 → closing → closed`, chat
runs `opening → talk → closed`. Each stage carries an authored goal
ladder (P0/P1/P2) that rides into the driver as a `GOALS` section —
goals order the driver's attention, they never force a move. This is
what gives the robot a direction in chat-from-zero instead of aimless
politeness. The lab renders the line as an overhead metro strip:
current stop lit, next stop flashing.

## 4. the cast

| agent | track | tier | reads | writes |
|---|---|---|---|---|
| driver | behavior | cognition | docs, frame, beats window, reads tail, goals, economy (incl. banked count), stall state, event | intents pile |
| persona (the wildcard) | behavior | cognition | character card, full beats, frame, intent | three takes; `spoken` becomes the oracle beat |
| interpreter | cognition | fast | beats delta, own tail, frame | reads pile — each read carries the visitor's inner-voice "thinking" lines (the ammo pool) |
| profiler | cognition | fast | beats delta, facet list, profile | the profile: the 14 survey facets filled freeform in-session, plus 2 elevated facets that steer the driver's question-led intro |
| conjector | cognition | cognition | profile, beats window, own last guess, dilemma doc | pending guess ("are you the kind of person who X when Y") until hot, then the dilemma document: problem_md / options_md / quest_md, re-edited one passage per cycle |
| attention | cognition | cognition | everything (docs when present, cards, piles, profile, frame) | the frame, whole |

The conjector is the interview's guesser rescued whole: it self-grades
cold/warm/hot off the visitor's actual reaction instead of buttons,
wakes only past `CONJECTOR_WAKE_FACETS` / `_TURNS`, and its document
is the session's spine — the naming at the midpoint ("the cards tell
me you have a choice"), the quest at the close.

**The whittling (2026-08-02).** The cast was ten; it is five. psychic
merged into the interpreter (both filed the visitor's unsaid sentences
— the `thoughts` field was literally duplicated across their schemas).
detective, joker, cassandra, and judge were pruned: across every live
run, no filing of theirs visibly changed a driver decision (cassandra
graded 0 hit / 3 miss and fed nothing by design; joker's bits were
banked but never played; detective had the weakest coupling and the
stage GOALS now carry "what to find out"). The fan is two haiku calls.
Ensemble principle applied: members must be DIVERSE AND CONSUMED —
a channel nobody reads is not diversity, it is noise plus latency.
Restore any of them from git history only with evidence they change
behavior. Accumulation now triggers spending: unspent interpreter
thoughts past `BANKED_THOUGHTS` nudge the driver to play one as ammo.

Prompts: one file per agent under `materials/prompts/ensemble/`,
editable without a code change; the authored beat library lives in
`materials/ensemble/beats.json`. The driver selects beats, not moves:
`question · tissue · rant_bid · deal · flip_invite · read · guess ·
naming · honor · close · hold` (menu-gated by the engine).

**The goldilocks pass.** The persona's call is structured now: she
files three takes — `too_safe` (the polite machine: agreeable,
costless), `too_far` (the boardwalk fortune teller: concludes too
much, predicts, advises), and `spoken`, the line between the floor and
the cliff. Only `spoken` reaches the scroll; the rejected takes stay
in the call record and show in the lab's persona panel. This is the
same self-calibration the Hand (ENSEMBLE-PLAN: ace/king candidate
intents + selection) was designed for, at one call instead of several
— **the Hand is dead** (decision 2026-07-24: too many agents already;
the goldilocks pass replaces it).

**Speech runs on the beat grammar** (SESSION-V2 §3): the engine
computes the legal beat MENU per moment (structure binds; off-menu
selections clamp), the driver selects, and the render mode does the
rest — V beats are authored lines spoken as written (zero calls), T
beats fill typed slots via a fast-tier call with mechanical validation
(QUOTE = verified substring of the visitor's actual words), F beats
(tissue / read / honor) ride the goldilocks persona path.

## 5. the loop

Per event (visitor line / flip / silence tick / open): driver call →
intent → persona call → speech commit. The open is the one exception:
with a greeting supplied it is scripted — beats commit directly, no
calls, and the greeting doesn't count as performed turns. A flip event carries the brief's
guide plus the card's Deck Bible entry (symbols + charge from
`materials/oracle/deck/`, 78 authored cards); attention receives the
full entry for every flipped card, which is what feeds the frame's
dressings section. Exactly two blocking calls; the
fan fires on thresholds (new visitor words, flips, a turns backstop),
one in flight, one pending, coalesced, never blocking. Attention regens
the frame on flip / stale flag / drift backstop, independently.

Failure covers: any fan agent throwing is skipped (session continues);
driver and persona retry once then fall back to canned (flagged in the
lab); the adapter itself retries malformed tool JSON once
(`invokeStreaming` and `invoke` share this contract). Interrupts are
generation bumps: a newer event makes in-flight results stale, and
stale results are discarded, not spoken.

## 6. operating it

**Web:** key entry → the three-door menu: demo (the booth), xray lab,
settings — both surfaces drive the SAME EnsembleEngine + telemetry and
emit the same SessionRecord/xray transcript (booth has its own copy
xray button). Setup: the
visitor casting (the dossier the sim plays — SESSION-V2 §9), optional
lab docs, the scenario note, chat or session, begin. Live: the card
strip (balatro row — face-down cards carry their position labels,
click to flip), and TWO composers: the left is you (keeps its text
until sent; enter sends it), the right is the CAST VISITOR — after
each oracle turn it predicts the dossier-person's next line, locks
while predicting, unlocks for editing once landed, clears+relocks on
any send, and never regenerates over an unsent line. "← use as mine"
copies it into your box. "copy xray" in the topbar puts the full
transcript on the clipboard — speech unindented, everything offstage
(engine decisions, every agent's thinking, the rejected persona takes)
tab-indented, in time order. Same format headlessly: every `pnpm
live` run writes `xray.txt`; `pnpm xray:render` regenerates them.

**The booth demo** (`src/ui/booth/`, "booth demo" in the lab topbar):
the full e2e session in 3d — two floating eyes in the starry void, the
red-cloth table, subtitles, a typed visitor line. The deal is theater
on top of engine truth: when the engine deals, the deck appears; the
visitor pulls each card off it by tapping (same cards, their pace),
and taps a face-down card to flip once the spread is fully out.
`BoothStage` (pure, node-portable) maps snapshots+clicks to the scene;
`pnpm smoke:booth` drives it headlessly through the whole arc. Live: cognition column (one panel per agent,
streams while in flight, filed items with anchors), the table (type as
the visitor, tick silence — manual-first, auto toggle default off, flip
buttons in session mode), behavior column (driver intent, persona
stream (with the two rejected takes), economy HUD, frame versions, config panel
with every constant live including FAN_BLOCKING and stall weights).
Click "inspect last call" anywhere for the exact prompt the model saw —
the single most important lab feature. Export json / export log.

**Headless:**

```
pnpm smoke:ensemble                  # stub adapter, asserts loop mechanics, no key
pnpm e2e:ensemble -- --stub          # validates the runner itself, no key
pnpm e2e:ensemble                    # live; key from --apiKey / ANTHROPIC_API_KEY / .env.local
pnpm e2e:ensemble -- --mode=session  # four flips, close, mantra
pnpm e2e:ensemble -- --auto --turns=8  # haiku plays the visitor from a hidden truth
pnpm live                            # THE LIVE TABLE: play a session turn by turn
pnpm live -- --driver-tier=fast      # A/B a haiku driver
```

`pnpm live` is the sit-across-from-it harness: it watches
`runs/live-<stamp>/inbox.txt` for `say <text>` / `flip <n>` / `tick` /
`end`, prints the oracle's beats plus the offstage thinking live, and
on end writes `audit.md` — the chronological thinking audit (every
intent, every rejected persona take, every filing) that answers
`docs/experiments/NORTH-STAR.md`'s question: which thinking changed
behavior, and which was noise.

Each live run writes `runs/ensemble-<stamp>-<mode>/`:
`transcript.md` (the scroll, then EVERY call full-fidelity —
system/user/output — plus a per-agent resourcing table) and
`session.json` (the same `SessionRecord` the lab's export button
writes; `serialize.ts` is the shared source).

Constants: `types.ts` `ENSEMBLE_CONSTANTS` is the truth; every one is a
live slider in the lab config panel.

---

*Everything below this line is point-in-time. Delete when stale.*

## 7. first live runs — what they established (2026-07-06)

Six sessions on a real key, iterating between runs. Final run: 99
calls, 0 errors, full move vocabulary, close landed the mantra
verbatim. Beat cadence ~8-9s on the API (driver ~6.6s, persona ~1.8s,
attention ~12s per regen).

Working, with evidence: the membrane (persona output stays in register;
intents are assignments, not wording); press and bank land ("then say
it.", "nobody ever asks what you need. / only what you can do."); flip
reads after FLIP_FILL; the close contract (read card 4 → visitor's
moment → close, mantra whole and last); beholder ledger discipline;
judge verdicts on cassandra; frame regens on every flip; all failure
covers exercised.

Not yet established / open observations:

- **the stall never fired** in six runs. scripted sends arrive
  instantly, so the fan is always fresh; the brake may only earn its
  keep against real typing pauses — or the driver may be too confident
  to reach for it. untested mechanic in practice.
- **cassandra graded 0 hit / 1 graze / 3 miss** on a deflection-heavy
  script. small sample; the scoreboard is doing its job.
- **read richness varies run to run** with identical config (one run:
  "…talking about carrying like she knows exactly how tired you are";
  another: "this one here."). variance, not regression.
- **persona name-tic**: one run appended "maya" to nearly every line.
- **arms comparison has not run** — the central claim is unmeasured.
- chat mode has had one live run; session mode five.
- joker bits are banked but rarely observably played.

## 8. the experiments backlog

Each: hypothesis → method → what decides it. Control the visitor track
(scripted or recorded), accept model variance, N≥5 repeats per
condition, rank transcripts blind before reading metrics. Scripts live
in `scripts/experiments/` (`pnpm exp:audit / exp:arms / exp:stall`);
curated results in `docs/experiments/` (README.md is the index).

1. **arms** — does the ensemble beat naive and baseline? same brief +
   track through all three, blind-rank. the gate for everything else.
2. **leave-one-out ablations** — RESOLVED BY THE WHITTLING (2026-08-02):
   detective, joker, cassandra, judge pruned; psychic merged into the
   interpreter. the residual version of this experiment: does the
   two-agent fan still earn its keep vs driver-only?
3. **FAN_BLOCKING A/B** — hindsight vs synchronous cognition. does
   press/bank/honor timing improve when the driver sees fresh reads?
   caveat: blocking results don't transfer to booth latency.
4. **stall stress** — tracks with heavy-disclosure-then-deflect, plus
   artificially emptied tails, to see if the brake ever earns its keep;
   force-stall runs to judge whether stall lines feel natural.
5. **cassandra calibration** — RETIRED: cassandra pruned (0 hit / 3
   miss on the sample; fed nothing). revisit only if speculative
   pre-drafting ever becomes the latency plan.
6. **ammo efficacy** — beats with ammo passed vs without: do the
   "sentence they were thinking" moments land? the magic-words
   hypothesis, measured.
7. **retention probe** — plant a fact at beat 3 of a 40-beat
   auto-visitor session; check whether the oracle can use it at beat 35.
   tests ledger → carried → persona, the whole memory-tier design.
8. **contradiction propagation** — visitor corrects a fact mid-session;
   does the ledger update, the frame carry it, the oracle stop being
   wrong?
9. **doc-input sweep** — same track with (a) rich portrait doc, (b) raw
   survey dump, (c) three bullet points, (d) nothing. tests the
   texture-beats-biography claim: sparse-structured may beat
   verbose-raw.
10. **reticence sweep** — auto-visitor dial chatty/normal/guarded; does
    carry fire, does the oracle hold a guarded room? talk-ratio curves.
11. **tier sweep** — driver and persona on fast/cognition/deep; find
    the actual quality bottleneck before optimizing anything.
12. **anti-rubric audits** — automated transcript scans (advice verbs,
    verdicts, name-tic frequency, two-questions-in-a-breath, retraction
    after press) against `docs/ANTI-RUBRICS.md`; humans blind-rank the
    residual. negative engineering first, per house method.
13. **duplication rate** — RESOLVED: the schemas already showed the
    overlap (both filed `thoughts`); psychic merged into interpreter.
14. **consensus profilers (wisdom of crowds)** — three differently-cast
    profilers (ideally different model families — same-family personas
    buy less diversity than they look like) read the same visitor
    BLIND to each other, over the course of a session. merge is a
    judge, not a ballot box: weight agreement by IMPROBABILITY
    (corroboration × surprisal — two blind profilers landing the same
    crazy guess is a coincidence too costly to be chance; agreement on
    the Barnum modal discounts toward zero). contradictions classify
    three ways: reader noise (drop both), adjudicable error (check the
    transcript), subject ambivalence (the jackpot — an externally
    discovered pole pair; route to the fork hunt as a lead, never the
    trash). blindness during generation is load-bearing: conformity is
    an interaction phenomenon, and the literature (degeneration-of-
    thought, hivemind collapse) says don't let them talk. candidate
    mechanisms: extremizing, surprisingly-popular (ask each profiler
    what it thinks the others said; elevate answers that beat their
    predicted popularity). what decides it: does the consensus profile
    beat the single condenser's portrait, blind-ranked, on the same
    session records?
