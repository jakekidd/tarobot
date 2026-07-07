# the oracle ensemble — reading engine + xray lab

Living truth for `src/pipeline/ensemble/` and `src/lab/xray/`. When this
doc and the code disagree, the code wins; fix the doc. `ENSEMBLE-PLAN.md`
(repo root) is the build plan that produced this system — mine it for
rationale, treat it as historical.

Ordering rule for this file: the top is universal (safe to build on),
the bottom is brittle (point-in-time findings, tuning state). When a
bottom section rots, delete it rather than patch it.

---

## 1. what this is

The ensemble is the live reading engine: the cluster of agents that runs
a conversation between the seer (the wildcard) and a visitor. It is
built **chat-first** — a conversation from zero is the primary mode; the
structured four-card session is the same engine with cards, flips, and a
close that lands a mantra.

The benchmark is explicit: the ensemble must beat (a) naive single
inference and (b) the single-voice baseline (`src/pipeline/oracle/`) on
real transcripts, blind-ranked. Until it does, the honest product is the
baseline. Both are kept runnable for exactly this reason.

The register is the house register: mirror, not oracle. The seer never
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
   the joker's bit (flavor), and ammo (one licensed verbatim sentence).
   This is the structural defense against sycophancy — the half that
   decides what is true never faces the visitor, so it has nothing to
   soften for. It holds by topology, not by prompt.
2. **Hindsight, not gating.** No model call sits between the visitor's
   line and the driver. Cognition enriches the NEXT beat. The one
   escape valve is the stall (§4): when the driver itself judges the
   moment too heavy to act on thin cognition, it buys a beat.
3. **Persistence by recurrence.** No decay timers anywhere. Consumers
   see pile tails; an agent keeps something alive by refiling it;
   durable insight survives by promotion into the frame. Memory tiers:
   tails are sensory memory, the frame is working memory, the piles +
   scroll are the record.
4. **Economy as pacing, not permission.** The word budget sizes lines;
   it never gates whether she may speak. A visitor who underfeeds gets
   a seer licensed to carry the room.
5. **Cache correctness.** The persona's context prefix (character card,
   then beats) is append-only and never edited. Everything volatile
   (frame, bit, intent) rides after it. This is the prod local-serving
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
  derived (count of seer speech commits), not stored.
- **The piles** — cognition's output, detached from the scroll. Every
  item is anchored to what its agent was reading. Refiling
  (`refreshes: id`) moves content to the tail; what stops being refiled
  slides out of every model's view but never out of the record. The
  facts pile is the one exception: a ledger merged by label, newest
  from-the-mouth wins, consumed whole by attention only.
- **The frame** — the seer's orientation, markdown, regenerated whole
  by attention (focus / dressings / stance / carried / prohibitions).
  Versioned; models only ever see the current one. Frame v1 is
  assembled deterministically from the input at start — no call, no
  latency.
- **The economy** — budget (fills sub-linearly by listening, empties by
  speaking, flips buy room to read), talk ratio, carry flag.

Input is `EnsembleInput { mode, docs, scenario, brief?, taboos }`:

- **docs** — markdown intake documents about the visitor, the
  experimental input channel. Managed in the lab (localStorage), fed
  verbatim to the driver and attention, never the persona.
- **scenario** — turn 0's given circumstances ("the player has just sat
  down…"). The opening is GENERATED through the normal hot path with
  the scenario as the event; chat without this structure is random.
- **brief** — required in session mode (cards, guides, mantra); the
  `OracleBrief` shape shared with the baseline arm.

## 4. the cast

| agent | track | tier | reads | writes |
|---|---|---|---|---|
| driver | behavior | cognition | docs, frame, beats window, tails, economy, stall state, event | intents pile |
| persona (the wildcard) | behavior | cognition | character card, full beats, frame, bit tail, intent | the seer beat |
| interpreter | cognition | fast | beats delta, own tail, frame | reads pile |
| psychic | cognition | fast | beats delta, own tail | thoughts pile (the magic words / ammo candidates) |
| detective | cognition | fast | beats delta, own open questions | questions pile |
| beholder | cognition | fast | beats delta, ledger | facts ledger (new/changed only) |
| joker | cognition | fast | beats delta, own tail | bits pile (tail-1 goes straight to the persona) |
| cassandra | cognition | fast | beats delta, own tail | predictions pile (feeds nothing; calibration meter) |
| judge | cognition | fast | prediction + actual next line | verdict stamped on the prediction |
| attention | cognition | cognition | everything (docs, brief, piles, ledger whole, frame) | the frame, whole |

Prompts: one file per agent under `materials/prompts/ensemble/`,
editable without a code change. The driver's moves: `hold · press ·
bank · honor · reflect · read · respond · stall · close`.

**The stall** is the brake between the tracks: when the moment is heavy
and the tails are thin, the driver outputs `stall` instead of guessing.
The persona speaks a low-commitment line (kind picked by the driver or
weighted-random from the catalog in `stall.ts`: reflect_back,
question_direct, confirm_feeling, question_detail, observation,
invite), the fan force-fires, and the next driver call carries the
STALL DEBT: "you bought a beat on X; cognition has weighed in; deliver."
Consecutive stalls cap at `STALL_MAX_CONSECUTIVE`.

## 5. the loop

Per event (visitor line / flip / silence tick / open): driver call →
intent → persona call → speech commit. A flip event carries the brief's
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

**Web:** menu → XRAY LAB (own world, like Bench). Setup: pick/edit
input docs, edit the scenario, choose chat or session (session gets the
brief JSON editor), begin. Live: cognition column (one panel per agent,
streams while in flight, filed items with anchors), the table (type as
the visitor, tick silence — manual-first, auto toggle default off, flip
buttons in session mode), behavior column (driver intent, persona
stream, economy HUD, cassandra scoreboard, frame versions, config panel
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
```

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
2. **leave-one-out ablations** — disable one fan agent (empty tail) per
   condition. if the driver's decisions don't degrade, that agent is
   latency without value. start with detective (weakest coupling).
3. **FAN_BLOCKING A/B** — hindsight vs synchronous cognition. does
   press/bank/honor timing improve when the driver sees fresh reads?
   caveat: blocking results don't transfer to booth latency.
4. **stall stress** — tracks with heavy-disclosure-then-deflect, plus
   artificially emptied tails, to see if the brake ever earns its keep;
   force-stall runs to judge whether stall lines feel natural.
5. **cassandra calibration** — bulk auto-visitor runs; chart hit rate
   by her own confidence (1/2/3). calibrated confidence is the gate for
   promoting her to speculative pre-drafting.
6. **ammo efficacy** — beats with ammo passed vs without: do the
   "sentence they were thinking" moments land? the magic-words
   hypothesis, measured.
7. **retention probe** — plant a fact at beat 3 of a 40-beat
   auto-visitor session; check whether the seer can use it at beat 35.
   tests ledger → carried → persona, the whole memory-tier design.
8. **contradiction propagation** — visitor corrects a fact mid-session;
   does the ledger update, the frame carry it, the seer stop being
   wrong?
9. **doc-input sweep** — same track with (a) rich portrait doc, (b) raw
   survey dump, (c) three bullet points, (d) nothing. tests the
   texture-beats-biography claim: sparse-structured may beat
   verbose-raw.
10. **reticence sweep** — auto-visitor dial chatty/normal/guarded; does
    carry fire, does the seer hold a guarded room? talk-ratio curves.
11. **tier sweep** — driver and persona on fast/cognition/deep; find
    the actual quality bottleneck before optimizing anything.
12. **anti-rubric audits** — automated transcript scans (advice verbs,
    verdicts, name-tic frequency, two-questions-in-a-breath, retraction
    after press) against `docs/ANTI-RUBRICS.md`; humans blind-rank the
    residual. negative engineering first, per house method.
13. **duplication rate** — how often do psychic thoughts ≈ interpreter
    thoughts? high overlap means one channel is redundant.
