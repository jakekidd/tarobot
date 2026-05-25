# Tarobot — Survey Engine v3 Refactor Plan

Onboarding doc for Claude Code. This specifies a refactor of the **survey
phase only**: the one-tap intake that finds the user's *Dilemma* and produces
an anchor document for the downstream reading. The card reading, the augur
forecasts, and the seer interview are **out of scope here** — this phase
produces their input, nothing more.

---

## 0. Standing caveats — read first

**Almost everything below is a hypothesis framework we are testing, not
settled truth.** It was reverse-engineered from a small corpus of real tarot
transcripts plus one interview with an experienced reader, then stress-tested
by adversarial analysis across three independent passes. It converged; the
sample is still small. Build it so the parts most likely to be wrong are the
parts easiest to change. The **anchor template (§12) is the weakest piece** —
treat the section set as configuration, not as a fixed schema.

**One meta-rule that supersedes the others: when something fails, do not add a
rule.** Fix the agent's disposition or the architecture. A prior version of
this project accumulated brittle prompt rules patching specific failures and
got worse. If a behavior is wrong, the cause is a wrong objective or a wrong
architectural boundary — find that, don't bolt on rule eleven.

**The find-then-read tension is acknowledged, not denied.** An experienced
tarot reader doesn't run a detective; he reads-and-follows — pulls cards,
shows symbols, lets the user's resonance select the direction. We're building
find-then-read because the festival deployment forces it: pre-tent line,
phone survey, latency budget. That's a real engineering compromise to the
craft, not a model of the craft. Hold the trade visible; don't pretend it's
optimal.

---

## 1. Scope

**In:** Refactor of `src/pipeline/survey/` to find one Dilemma via Bayesian
hypothesis-testing on an LLM prior, output a markdown Subject Anchor + a
sibling verbatim log.

**Out (downstream, do not touch):**
- The seer reading engine (`src/pipeline/seer/`)
- The augur forecast generator (`src/pipeline/survey/agents/augur/`) — stays as-is, intention-time invocation
- The card mechanics, spreads, persona data
- The wound→awareness→change→healing session arc (that's the reading's job)
- Any forecasting machinery

This refactor produces the anchor + log. Everything downstream consumes them.

---

## 2. Core principle — why this works for an LLM

The survey is **Bayesian updating on a prior the model brings for free.** An
LLM has seen millions of human situations, so from a sparse seed it can
generate a *ranked distribution over likely Dilemmas* without asking much. The
job is therefore not to *build* a profile from scratch by interrogation — it's
to spend a tiny interaction budget on **maximum-information-gain tests** that
collapse that distribution to one confident, specific Dilemma.

Consequence: judge each interaction by *how much it splits the remaining
hypothesis space*, not by how much it "asks."

---

## 3. The Dilemma — the target object

**Definition.** A Dilemma is a *delta* the user is sitting at: where they are
now → where they need to be, rendered as a **fork** where one branch is
*always* the do-nothing path ("continue as you are"). Every reading has a
Dilemma; if there genuinely isn't one, there's no reading to give.

**Single typology.** All Dilemmas are forks. The corpus pressured us toward a
five-type taxonomy (fork / drift / pattern / grief / null); each one
collapses into the same shape under examination:

- **Drift** = a fork where the alternative branch is "steer this consciously
  before it steers you." Do-nothing branch is the unsteered continuation.
- **Pattern** = a fork where the alternative is "see the loop and break it."
  (We do not use the label "pattern" in code — it's a license for the
  detective to pattern-match on noise.)
- **Reinforcement** (Cleo) = a fork where the do-nothing branch is the
  **good** one and the work is naming the quiet anxiety that made them come
  anyway. The expert reader confirmed: there's always anxiety; pure no-need-
  to-do-anything readings essentially don't occur.
- **Grief** = a fork where the alternative branch is acceptance-work
  ("continue letting this eat you" vs. "do something about it"). Acceptance
  is a delta; not-at-peace → at-peace is movement.
- **Fork proper** = a stated live decision.

Treat them all as forks. The do-nothing-branch slot is structural; what fills
the alternative branch is what the detective is hunting toward.

**Domain (tag, not type).** Subject matter — work / love / belonging / shelter
/ family / self / mortality / meaning — is metadata attached to the Dilemma,
not a primary classifier. Same Dilemma type can live in any domain; same
domain can host any Dilemma type. Domain tells the persona which vocabulary to
reach for; type determines machine behavior. They're orthogonal axes.

---

## 4. The three roles — and the hard split

Two cognition agents, one presentation layer. **The split is architectural,
not stylistic.** Collapsing the two cognition agents recreates the failure
mode that has bitten this project twice (hypothesis-believes-itself, and
analysis-leaking-into-voice).

### MASCOT — presentation (thin)

The turtle. Speaks the user-facing text: in-character reactions, transitions,
and the **stall lines** that fill latency while detective+profiler run (see
§7 on assertions carrying pre-baked stall lines). Decides nothing about
substance. Renamed from "Clat" (legacy) — all references to Clat get rewritten
to mascot.

Today this is satisfied by a Claude call (`commentaryAfter`). For
high-traffic stall lines the detective bakes the lines into the assertion
item itself, eliminating an LLM call entirely.

### DETECTIVE — hunter cognition

Generates the *substance*: picks the next instrument, writes the candidate
statement(s)/choices, **owns its working distribution over candidate
Dilemmas**, updates on every response. Forward-leaning, exploit-greedy, wants
to resolve.

- **Does not speak to the user directly** — it produces the item content the
  mascot presents.
- **Scored on falsifiability, not hit rate.** A rejection-with-correction is
  a *success* of the instrument, not a failure of the guess (see §13).
- **Stays light:** Sonnet, no extended thinking, every turn. Concise system
  prompt that stays static across turns (KV-cache hits preserved).
- **Owns the working distribution.** The detective does *not* read the
  profiler's anchor prose to decide what to ask — it consumes raw answer
  events and updates its own internal distribution. Profile prose is for
  downstream handoff, not for the hunt.

### PROFILER — scribe cognition

Metabolizes resolved evidence into the Subject Anchor document. Backward-
looking, conservative, custodial; wants to record accurately. **Refuses to
let a guess become a fact** — only tested-and-survived claims become findings;
everything else is logged as suspicion.

- **Triggered on:** (a) every 3 turns as heartbeat, (b) every correction event
  (rejection-with-correction — the high-signal resolution), (c) one final
  pass at survey close.
- **Tier ladder by depth:** Haiku in SEED phase (low signal density, doc just
  starting) → Sonnet in EXPLORE → Opus in EXPLOIT and at close (max quality
  for the artifact that ships to the seer).
- **Extended thinking off** for routine passes; on for the final close pass.
- **Async, non-blocking.** Runs in parallel with the detective when both fire
  off the same answer event. The detective does not wait for the profiler.

### Why this split

The detective and profiler pull in opposite directions, and that's exactly
why they should be different agents. If the detective also owns the profile,
it will write its own hypotheses into the record as if they were findings —
the confirmation-bias failure. Splitting them gives a built-in check: the
detective proposes, the profiler only writes down what survived a test, and
tags the rest as suspicion. The profiler is the thing that refuses to let a
guess become a fact without evidence.

---

## 5. The survey arc

Four stages. Stages are **fixed** (predictable, debuggable). One **adaptive
seam** lives inside EXPLOIT.

```
SEED       10 pillars (fixed, in order, from materials/survey.md).
           Locate domain + register; shape the prior. Tests nothing yet.
                                │
EXPLORE    Forced-choice-among-statements with None.
           Broad hypothesis tests. Each tap eliminates the unpicked
           candidates and/or confirms one; None redirects the cluster.
                                │
EXPLOIT    Drive the leading candidate-Dilemma to high confidence AND
           specificity.
           ── adaptive seam ──  the detective chooses the next instrument
           based on the leader's state:
             • two candidates competing    → comparative A-vs-B
             • single leader, fuzzy        → near-miss (visions)
             • single leader, specific     → assertion
                                │
TERMINATE  one Dilemma wins with confidence    → write anchor, route to augur
           budget spent                        → commit to leader, flag low-conf
           content-level dead-end signals fire → route to light/null path (§9)
```

---

## 6. SEED phase — the 10 pillars

These are the always-asked questions, in order, post-openers. They locate
domain + register and seed the detective's distribution; they do not test
Dilemma-hypotheses. Authoritative source: `materials/survey.md` (edits there
ship to production via Vercel rebuild).

Current set carries forward, with **3 additions** to reach 10 and **one
decoder expansion**:

| #  | Question                                                       | Format             | Status      |
|----|----------------------------------------------------------------|--------------------|-------------|
| 1  | Have you done this before?                                     | choice             | unchanged   |
| 2  | What's your relationship to the spiritual?                     | choice             | unchanged   |
| 3  | How do you make decisions?                                     | choice             | **expanded** — options become `mind / heart / gut / root / spirit` |
| 4  | Who is the most important person in your life?                 | relationship_pick  | unchanged   |
| 5  | How do you think others perceive you?                          | choice             | unchanged   |
| 6  | Which of these do you value most?                              | choice             | options unchanged; decoder gets the **DFW worship framing** in `Inversions` |
| 7  | Which one is your question right now?                          | fork               | unchanged   |
| 8  | What's a true thing you stopped saying out loud?               | relationship_pick  | **new** — surfaces the unsaid *target*, not the content |
| 9  | When you're alone with your thoughts, whose voice do you hear? | choice             | **new** — interior cast; if "someone real," follow-up `relationship_pick` |
| 10 | What's the last thing you noticed yourself avoiding?           | choice             | **new** — `a person / a decision / a feeling / a piece of news / nothing — i've been facing it`. The `nothing` option is the **Cleo-detector** |

**Why these 3 additions:**

- **#8 (true thing stopped saying)** — high-probability route to a Dilemma the
  user is half-aware of. The format (whom they stopped saying it *to*) is the
  load-bearing data; the content surfaces later via the detective's
  assertions.
- **#9 (whose voice)** — reveals interior cast (parental introjects, partner-
  voice, dead-mentor-voice) that drives many Dilemmas. Named people become
  Hooks the reading can echo uncannily.
- **#10 (avoiding)** — earns its slot post-engagement-scalar-killing (§8).
  The `nothing` option is the content-level early signal for a true-empty/
  reinforcement Dilemma. At pillar 10, a user who has picked low-content
  answers across the first 9 and lands on `nothing` here has a high prior
  for the reinforcement case — and the engine has somewhere clean to log
  it.

**Decoder edits (in `materials/survey.md`):**

- **#3 (decisions):** add rows for `root` (security/material-survival
  decisions — surfaces survival-mode users, money-as-survival not money-as-
  ambition) and `spirit` (transcendent/values-led decisions — surfaces post-
  religious users still operating from inherited frames).
- **#6 (value_most):** keep options. Add to `Inversions` block: "framing
  helper — DFW's worship thesis (everyone worships, the only choice is what).
  money worship → worth-output equation; intellect → rationalism as armor;
  beauty → fear of decay; power → fear of powerlessness; love → fear of being
  unlovable; freedom → fear of constraint; wisdom → fear of being foolish;
  security → fear of chaos." This is detective/profiler context, not user-
  facing.

---

## 7. Instruments

All one-tap unless noted. The detective selects among them; §5 dictates when.

### assertion (was "truthiness")

The backbone exploit instrument. A specific, falsifiable claim about the
user. User taps `true` / `false` / `correction` (where correction is
1-tap-with-likely-inversions, text fallback only when unpredictable).

**Item shape:**
```
{
  kind: 'assertion',
  statement: "you've left in your head but not your feet",
  predicts_dilemma_id: <id of the candidate-Dilemma this tests>,
  comment_if_true: "thought so — let me sit with that.",
  comment_if_false: "ok — that one's mine, not yours.",
  correction_inversions?: string[]  // up to 4 likely-inversions for 1-tap correction
}
```

**The mascot stall lines** (`comment_if_true`, `comment_if_false`) are
**generated by the detective alongside the assertion** and shipped with the
item. The mascot speaks them immediately on user response — zero LLM latency
on the user-facing response. They buy 1–3 seconds of cover for
detective+profiler to generate the next assertion in the background. They are
not just stalls — they're in-character mascot lines that *also* land the
moment.

**Renamed from "truthiness."** Three reasons:
- "Truthiness" carries Colbertian baggage (gut-feel-of-truth) — wrong
  connotation for a falsifiable instrument.
- "Assertion" is the precise technical term — the detective *asserts*; the
  user accepts/rejects/corrects.
- Pairs cleanly with the falsifiability principle (§13): an assertion is
  literally what you can falsify.

### forced_choice_with_none

EXPLORE phase. Emit 3–4 competing Dilemma-hypotheses; user picks one or None.
**Highest collapse-per-tap.** Always offer None — None redirects the whole
cluster (high information).

### compare_ab

EXPLOIT phase, when two candidates compete. Two both-plausible Dilemmas;
"which is more true." Humans rank reliably even when they self-rate
unreliably; can't be no-ped out of. Converges in ~log(n) taps.

### near_miss (visions)

EXPLOIT phase, when a single candidate is leading but the contour is fuzzy.
Detective deliberately guesses wrong by one degree to make the user draw the
real line themselves. The correction is the single highest-specificity
output in the entire survey.

---

## 8. What we are NOT building — engagement signals

The brainstorm doc proposed an "engagement trajectory" scalar (latency-
z-score + answer specificity + skip rate → opening/flat/closing slope) as the
load-bearing primitive for dead-end detection. **We are not building it.**
Reasoning:

- The deployment is **virtual** (phone survey, no camera, no booth). The only
  available signal is response latency, which is pure noise in a phone
  context (user distracted, took a call, looked away, etc.).
- A noisy primary signal that drives behavior change is worse than no signal —
  it produces brittle false-positives.
- **Content-level signals are richer and more trustworthy in our medium**
  (see §9).

**Telemetry capture stays.** `timing_log` continues to record per-turn
latency for offline analysis and corpus export. It is **export-only** — the
detective and profiler prompts never receive it, never key behavior off it.

---

## 9. Termination & routing — the no-manufacturing rule

The survey **must be able to conclude there is no Dilemma worth working** and
route to a light/null landing **without inventing one.** A system that cannot
return null is structurally a crisis-manufacturer.

**Dead-end signals are content-level, not behavioral:**

- **Distribution flatness.** After N turns in EXPLORE, no candidate-Dilemma
  has concentrated mass. The hunt isn't finding anything.
- **None-streak.** User has hit `None` on K consecutive `forced_choice_with_
  none` items. Their answer-content is rejecting the cluster wholesale.
- **Rejection-without-correction streak.** User has rejected K consecutive
  assertions with no correction offered. The hunt isn't drawing the contour;
  there's no contour to draw.

These thresholds are tuneable in `routing.ts`; start with conservative values
(N=6, K=3) and adjust on observation.

**Camouflage / wall / dead-end distinction is downgraded.** The brainstorm
doc treated these as three branches the detective must route between. The
expert reader doesn't bother — he reads-and-follows; the distinction
dissolves when you stop trying to target. In our find-then-read
architecture we still need *some* termination logic, but we collapse the
three to a single content-level test:

```
if dead_end_signals_fire:
    route to null_landing (light path)
else:
    keep hunting
```

That's it. We're not pre-classifying the user. If they're camouflaging, the
hunt will eventually surface the material *or* hit dead-end signals
genuinely. If they're walling, dead-end signals fire and we land them
gracefully. The detective doesn't need to know which it was.

---

## 10. Pipeline parallelism — latency hiding

**Goal:** keep ~3 assertions queued ahead of the user at all times, so that
detective+profiler generation runs entirely in the latency gap between user
taps.

**Flow per user answer:**

```
1. User answers assertion N.
   → Mascot immediately speaks `comment_if_<answer>` (zero LLM call).
   → User sees the response within ~50ms.

2. Engine snapshots state: { history+answer, distribution@v, profile@v }.

3. Fan out from snapshot:
   a. DETECTIVE thread (always, every turn, Sonnet):
      - reads snapshot
      - emits assertion N+3 with stall lines
      - appended to queue tail
   b. PROFILER thread (conditional — see triggers below):
      - reads snapshot
      - rewrites Subject Anchor whole-doc
      - commits to profile store (versioned)

4. Both threads write to engine state on completion; staleness gating
   via version counters (existing `based_on_v` mechanism).
```

**Profiler trigger logic:**

- **Every 3 turns** as heartbeat (debug visibility — doc evolves in the
  panel) — fires alongside detective at turn-modulo-0.
- **On every correction event** — rejection-with-correction is the single
  highest-value resolution; the doc must metabolize it immediately, not wait
  for the next heartbeat.
- **One final pass at survey close** — Opus with extended thinking; produces
  the artifact that ships to the seer.

**Profiler tier ladder by phase:**

| Phase     | Profiler tier | Extended thinking |
|-----------|---------------|-------------------|
| SEED      | Haiku         | off               |
| EXPLORE   | Sonnet        | off               |
| EXPLOIT   | Opus          | off               |
| Close     | Opus          | **on**            |

**Detective stays Sonnet, thinking off, every turn.** Static system prompt
across turns (full KV cache hits on the long prompt; only the user-message
payload changes turn-to-turn).

**The "sieve" idea** — making the detective's prompt more specific as the
session progresses — lives entirely in the user-message payload, not the
system prompt. The system prompt carries the detective's role, the
instruments, the standing principles. The user payload carries the current
distribution, the prior assertions, the active phase, and any
specificity-dial directives. This preserves cache.

---

## 11. Artifacts — the anchor doc is SEPARATE from attached context

Three distinct stores, with a hard contract on what flows downstream.

**A. Subject Anchor (the profile).** Markdown, prose, template in §12.
This is the *interpreted, synthesized* picture — what the downstream reading
reads from. It is **not** JSON and **not** atomic facts; a slot called
`cast: []` invites a name-list, a prose section invites an observation. The
profiler owns it. Rewritten whole-doc on every profiler firing (no deltas
during development).

**B. Verbatim log (attached context resource, NOT part of the profile).**
Every free-text user input, captured **deterministically and mechanically**,
append-only, **immutable, never rewritten by any agent.** The user's exact
words are the highest-value raw material for later uncanny-specific
callbacks, and they need fidelity no LLM paraphrase can preserve. The anchor
*references into* this log ("said it 'preserves rest' — see entry 7")
rather than reproducing quotes.

```typescript
type VerbatimEntry = {
  index: number;
  turn: number;
  source: 'intent' | 'correction' | 'text_fallback' | 'name';
  text: string;  // exact, untrimmed except for whitespace edges
};
```

**C. Detective working state (internal, not handed downstream).** The live
candidate-Dilemma distribution, the evidence trail (which items
confirmed/rejected/corrected), the prior-assertions list. This is the hunt's
scratchpad. The reading robot does **not** read this.

**D. Timing log (telemetry only, not handed to agents).** Per-turn response
latency, captured deterministically. Exported with corpus snapshots for
offline analysis. Never enters an agent's prompt.

**Downstream contract:** the seer (and augur, indirectly) receives **the
Anchor (A) + the verbatim log (B) attached as context**. Nothing else. The
detective's working state stays internal; timing telemetry stays export-only.

---

## 12. The anchor template — SAMPLE / HYPOTHESIS, build it swappable

**This is the part we are least confident in.** Treat the section set as
**configuration**, not as a fixed schema — the profiler should read its
section definitions from one place that's trivial to edit, so we can run
different templates and compare. Below is a starting sample.

```markdown
# Subject Anchor — {name or "unnamed"}

## The Dilemma                ← center of gravity
The delta — where they are now, and where the reading is trying to move
them — rendered as a fork with the do-nothing branch explicit. State
whether they seem AWARE of it (decides whether the reading reveals vs.
affirms-and-forecasts). State confidence. Domain tag(s) inline.

  e.g. "She equates output with worth and is heading into a burnout cycle
  she half-sees. Fork: keep building (community + momentum, no refuge)
  vs. architect the work-free space first. Aware of the symptom (the
  burning out) but not the engine (the worth equation). Domain: work +
  belonging. Confidence: medium-high."

## Unsaid                     ← the inference layer, the real read
Synthesized observations they did NOT volunteer and may not recognize. The
gap between their self-story and the pattern underneath. This is what the
reading surfaces.

## What They'd Say About Themselves  ← their own framing
How they narrate themselves; what they already know and would say aloud.
The reading hands this back; it doesn't reveal it. References into
verbatim log: e.g., "said 'I burn myself out pretty quick' — entry 4."

## Domain                     ← tag, not type; informs persona vocabulary
Which subject-matter neighborhoods the Dilemma touches (work / love /
belonging / shelter / family / self / mortality / meaning). Note
conspicuous absences — a Dilemma framed as community-vs-solitude with
zero relational language is itself loud.

## How They're Holding It     ← stance; governs delivery, not content
cooperative / guarded / skeptical / grieving / content / testing /
performing / honest. How to be in the room with them.

## Suspicions — DO NOT VOICE  ← fenced; leads only, never quotable
Low-confidence leads. Steer toward, never assert. Quoting from here is
the cop-sheet failure. **Downstream prompts must respect this fence as a
hard instruction.**

## Margin                     ← scribbles; anything that doesn't fit
```

**Example alternative / candidate sections** to try when swapping templates
(don't run them all at once — the doc must stay short enough to anchor, not
bloat into a dossier):

- **Awareness Gap** — split out from The Dilemma, since aware-vs-unaware is
  the bit that drives reveal-vs-affirm downstream.
- **Live Threads** — recurring words/motifs the user returns to.
- **Register** — mystical-vs-honest, the unrecoverable-if-wrong axis.
  Getting register wrong torpedoes a reading worse than getting content
  wrong.
- **Confidence Ledger** — one line per finding with supporting evidence
  reference.
- **What Stops Them** — the bind (guilt / fear / comfort / inertia).

**Discipline that should survive any template change:**

- Prose, not slots.
- Sources where they matter (verbatim log references).
- Suspicions fenced and never quotable.
- Short enough to anchor (a page, not a dossier).
- Stop writing when one Dilemma has won, not when the page is full —
  extra confirmed-but-irrelevant detail is the cop-sheet creeping back.

---

## 13. Standing principles — hard, survive template changes

- **Falsifiability is the objective, not hit rate.** Score the detective on
  whether its assertions are *risky enough to be wrong.* A **rejection-with-
  correction is the highest-value outcome in the survey** — it eliminates,
  redirects, and hands you the user's own contour. An agent optimized for
  being "right" builds a horoscope.
- **Specific-enough-to-be-wrong (Barnum guard).** Any assertion a user
  can't reject returns zero bits. "You feel deeply but keep some protected"
  is worthless even when confirmed. Every assertion must be rejectable.
- **Detective proposes, profiler records; the boundary is hard.** A guess
  never becomes a fact without surviving a test.
- **Cognition steers by editing documents; it never speaks.** The detective
  produces item content; the mascot presents. Cognition does not author
  voice.
- **No new rules on failure.** Fix disposition or architecture (see §0).
- **Null is a valid, gracefully-landable terminal state** (see §9).
- **No engagement-trajectory signal.** Latency is noise in our medium
  (see §8).

---

## 14. The bet — flag honestly in code

Two parts of this design are wagers, not corpus-supported. Mark them as
such where they live.

**The downstream forecasting thesis** (do-nothing-vs-change branch
forecasts in the augur) is *our* hypothesis. No human reader in the corpus
forecasts; they refuse to predict. The expert tarot reader explicitly
called this *not* what tarot does. It may be our best differentiator or it
may be overreach. Out of scope here; flag it when the augur is touched.

**The find-then-read architecture itself** is a festival-constraint
concession. The expert reads-and-follows. We're building the survey to
target-and-deliver because the deployment forces it. The survey's
front-half is corpus-supported; the *separation* of survey from reading is
the wager.

---

## 15. Migration map — what stays / changes / dies

### Stays unchanged

| File / module                                | Why                                                   |
|----------------------------------------------|-------------------------------------------------------|
| `src/pipeline/llm/adapter.ts`                | Interface is the seam; stays                          |
| `src/pipeline/llm/adapter-anthropic.ts`      | Concrete impl, no API surface changes                 |
| `src/pipeline/claude.ts`                     | Tier→model map; tier names still apply                |
| `src/pipeline/seer/`                         | Out of scope                                          |
| `src/pipeline/survey/agents/augur/`          | Out of scope, intention-time only                     |
| `src/pipeline/cards.ts`, `spreads.ts`        | Static data                                           |
| `src/pipeline/survey/tree.ts`                | Pillar source-of-truth parser                         |
| `src/pipeline/survey/parseSurveyMd.ts`       | Markdown parser; pillar additions parse cleanly       |
| `src/pipeline/survey/seeder.ts`              | Inversion→hypothesis seeder; feeds detective prior    |
| `src/pipeline/survey/returning.ts`           | Returning-user logic                                  |
| `src/pipeline/survey/return-lines.ts`        | Mascot lines for resume                               |
| `src/pipeline/survey/substitution.ts`        | `{name}` etc. template substitution                   |
| `src/pipeline/survey/template.ts`            | Question rendering                                    |
| `src/pipeline/survey/algoExtract.ts`         | Algorithmic timing/z-score extraction → telemetry only |
| `src/storage.ts`                             | Person/session shape; verbatim_log slot added         |
| `src/ui/Survey.tsx`                          | Format dispatch; new instruments add format cases     |
| `src/ui/survey/useSurveyEngine.ts`           | Hook contract stays                                   |

### Renamed / repurposed

| Before                                       | After                                                 | Change                                                              |
|----------------------------------------------|-------------------------------------------------------|---------------------------------------------------------------------|
| `agents/observer/`                           | `agents/profiler/`                                    | Resolution-triggered (every 3 turns + corrections + close); writes markdown anchor not LivingDoc deltas |
| `agents/detective/`                          | `agents/detective/` (unchanged name)                  | Output schema rewritten: emits `Instrument` items, not `next_move`; owns distribution |
| `agents/interrogator/` + `agents/crowd/`     | `agents/detective/generation/`                        | Folded into detective as instrument-rendering helpers; no longer standalone agents |
| `adversarial.ts`                             | `distribution.ts`                                     | Token-overlap-vs-coverage scorer → candidate-Dilemma distribution tracker |
| `coverage.ts`                                | `distribution.ts` (merged)                            | "Axes covered" → "distribution entropy" semantics                   |
| `living-doc.ts`                              | `anchor.ts` + `anchor-template.ts`                    | TS struct → markdown sections; sections-as-config (swappable)       |
| `materials/prompts/observer.md`              | `materials/prompts/profiler.md`                       | Rewritten around: write anchor sections in prose, never quote suspicions, reference into verbatim log |
| `materials/prompts/detective.md`             | `materials/prompts/detective.md`                      | Rewritten around: hunt Dilemmas, emit instruments, score falsifiability |
| `materials/prompts/interrogator.md` + `crowd.md` | `materials/prompts/detective-generation.md`        | Folded; the detective's own prompt covers instrument shape          |
| `materials/templates/profile.md`             | `materials/templates/anchor.md`                       | Section set from §12                                                |
| Legacy "Clat" references everywhere          | "mascot"                                              | Find/replace in code, prose, prompt filenames, comments             |

### New

| File                                                 | Purpose                                                                |
|------------------------------------------------------|------------------------------------------------------------------------|
| `src/pipeline/survey/instruments.ts`                 | `Instrument` discriminated union: `assertion` / `forced_choice_with_none` / `compare_ab` / `near_miss` |
| `src/pipeline/survey/arc.ts`                         | SEED → EXPLORE → EXPLOIT → TERMINATE controller; adaptive seam in EXPLOIT |
| `src/pipeline/survey/signals.ts`                     | Content-level dead-end detection (distribution flatness, None-streak, rejection-without-correction streak) |
| `src/pipeline/survey/routing.ts`                     | Null-path transition logic                                             |
| `src/pipeline/survey/verbatim-log.ts`                | Append-only immutable user-text store                                  |
| `src/pipeline/survey/anchor.ts`                      | Markdown anchor struct + serialization                                 |
| `src/pipeline/survey/anchor-template.ts`             | Section set as configuration (swappable)                               |
| `materials/prompts/mascot.md`                        | Mascot register / stall-line guidelines (replaces inline `commentaryAfter` prompts where they exist) |
| `materials/prompts/profiler.md`                      | (See above)                                                            |

### Deleted

| File                                                 | Why                                                                    |
|------------------------------------------------------|------------------------------------------------------------------------|
| `src/pipeline/survey/heat.ts`                        | Heat is dead code; phase derives from turn count only; no engagement scalar in v3 |
| `src/pipeline/survey/phase.ts`                       | Replaced by `arc.ts`; phase letters (A/B/C/D/E) → stages (SEED/EXPLORE/EXPLOIT/TERMINATE) |
| `src/pipeline/survey/close.ts`                       | Close logic absorbed into `arc.ts` and `routing.ts`                    |
| `src/pipeline/survey/profile-assembly.ts`            | LivingDoc → anchor doc; assembly is now profiler's job, not deterministic |
| `materials/templates/story.md`                       | Story is downstream (seer) concern; not part of the anchor             |

### State-shape changes in `src/storage.ts`

```typescript
// Person record (schema_version 3)
type Person = {
  id: string;
  schema_version: 3;
  name: string;
  profile: SurveyProfile;
  anchor: string;                  // markdown, the rendered Subject Anchor
  verbatim_log: VerbatimEntry[];   // immutable, append-only
  timing_log: TimingEvent[];       // telemetry only
  intentions: string[];
  created_at: number;
  last_visited: number;
};
```

`purgeLegacyPersons()` extends to drop v2 records. (Browser localStorage; no
migration burden.)

### UI surface changes in `src/ui/Survey.tsx`

- New format dispatch cases:
  - `assertion` → renders statement + true/false + correction one-tap-grid
  - `forced_choice_with_none` → renders 3–4 statements + None
  - `compare_ab` → renders two statements side-by-side, "which is more true"
  - `near_miss` → renders an assertion with the correction path foregrounded
- Mascot stall lines (`comment_if_*`) deliver immediately on tap, before the
  next item renders.

---

## 16. Build sequence — phased so the wound-vs-fork pivot validates cheaply

This is the **order** of implementation. Each phase is one branch commit.
Stop and walk through the survey after each before moving on.

### Phase 1 — Reframe (cheap, sets direction, no new agents)

- Rename Clat → mascot everywhere.
- Update `materials/survey.md`: add pillars 8/9/10; expand decisions decoder
  to mind/heart/gut/root/spirit; add DFW worship framing to value_most
  Inversions block.
- Rewrite `materials/prompts/detective.md` and `observer.md` around the
  Dilemma framing (hunt Dilemmas, not stories; do not write "wound" or
  "fork" as universal spines — write "Dilemma" with the fork-with-do-nothing
  structural rule).
- Delete `materials/templates/story.md`.
- Replace `LivingDoc.scaffold.leading_hypothesis` semantics → leading
  *Dilemma* candidate; same field, sharper meaning.

**Validates:** Dilemma framing produces sensible outputs before we tear out
the queue model.

### Phase 2 — Profiler split + verbatim log + null path + debug rebuild

- Split `agents/observer/` → `agents/profiler/`. New trigger: every 3 turns +
  on correction events + close pass. Tier ladder by phase.
- Detective stops writing scaffold; only emits hypothesis tests + observations.
- Add `verbatim-log.ts`; capture intent + corrections + text fallbacks.
- Add `null_landing` stage in arc state machine. Wire the transition; no
  light-reading mode yet (out of scope), just terminate cleanly.
- `signals.ts` v1: distribution flatness, None-streak, rejection-without-
  correction streak.
- **Debug panel rebuild (see §17).** Delete `DebugQueue.tsx`; shrink
  `Debug.tsx`. Add `ProfilerWorkspace.tsx` + `AnchorView.tsx` +
  `anchorBus.ts` + `profilerActivityBus.ts`. Wire profiler runner to
  publish to both buses on each pass.

**Validates:** Splits ownership. Wires the safety branch. The doc starts
evolving as prose in the debug panel — visible thinking in real time.

### Phase 3 — Instruments + adaptive seam

- New `instruments.ts` discriminated union.
- Detective output schema rewritten around `next_instrument`.
- `arc.ts` adaptive seam: detective picks instrument based on
  distribution state (leader confidence + fuzziness).
- UI format dispatch for the 4 new instrument shapes.
- Mascot stall lines baked into assertion items.

**Validates:** The substantive UX change. User sees a different survey.

### Phase 4 — Pipeline parallelism + tier ladder

- Profiler runs in parallel with detective off same snapshot.
- Detective queue stays ~3 ahead.
- Tier ladder for profiler by phase (Haiku → Sonnet → Opus → Opus+thinking).
- Detective stays Sonnet throughout, system prompt static, sieve directives
  in user payload.

**Validates:** Latency is hidden. User doesn't see model calls.

### Phase 5 (deferred) — Refinements

Coverage panel UI showing live candidate-Dilemma distribution. Visible-
per-dimension confidence in the production iris. Anchor template
experimentation (alternative section sets).

---

## 17. Debug panel — visible thinking during the hunt

The current debug surface has two left-column widgets (`Debug` key/value
snapshot + `DebugQueue` basket view) plus a floating `AgentActivity`
stream. **The two left-column widgets get replaced by a single live
"profile-being-built" column.** The `AgentActivity` floating panel stays
as-is (it tracks LLM call lifecycle, orthogonal concern).

**Why:** visible thinking is the development tool that tells us whether
the engine is *reasoning* or just *generating*. Watching the anchor doc
evolve turn-by-turn, with clear markers for *what triggered each update*,
is the cheapest possible diagnostic for "is the profiler doing real work,
or is it confabulating." It's also where the read-and-follow tension
(§0) shows up first — if the doc fills with confident assertions from
flimsy evidence, the architecture is broken.

### Layout — left column, survey phase only

```
┌─────────────────────────────────────┐
│  PROFILER WORKSPACE                 │  ← top 1/3 (or 1/4)
│  ─────────────────                  │
│  • last trigger: correction @ T7    │
│  • model tier: sonnet               │
│  • draft (not yet committed): …    │
│  • last 3 suspicions raised/dropped │
│                                     │
├─────────────────────────────────────┤
│  SUBJECT ANCHOR                     │  ← bottom 2/3 (or 3/4)
│  ─────────────────                  │
│                                     │
│  # Subject Anchor — jake            │
│                                     │
│  ## The Dilemma  [✱ updated T7]     │
│  prose prose prose…                 │
│                                     │
│  ## Unsaid                          │
│  prose prose prose…                 │
│                                     │
│  ## What They'd Say About Themselves│
│  prose prose prose…                 │
│                                     │
│  …                                  │
└─────────────────────────────────────┘
```

### Top region — profiler workspace

A compact strip that surfaces the profiler's **non-committed thinking** —
anything the AI considered but didn't put in the anchor. Sources:

- **Last trigger** — what fired the latest profiler pass. Either
  `heartbeat-3 @ T<n>`, `correction @ T<n>`, or `close pass`. (A
  user-facing engineer should be able to read at a glance *why* the
  profiler ran, not just *that* it ran.)
- **Tier in use** — which model the profiler is currently on (`haiku` /
  `sonnet` / `opus` / `opus+thinking`). Tier ladder is phase-driven (§4,
  §10); seeing it surface here is the debug feedback loop for the
  ladder itself.
- **Draft / scratch output** — if the profiler emits any
  meta-commentary alongside the anchor rewrite (e.g., reasoning about
  whether to elevate a suspicion to the Unsaid section), it lands here,
  not in the committed doc.
- **Suspicions raised / dropped this pass** — diff of the
  `Suspicions — DO NOT VOICE` section across the latest write. Helps
  catch the failure mode where the profiler accumulates suspicions
  without ever resolving them (which would be the cop-sheet creeping
  back in via a fenced section).

This region is **agent thinking, not anchor content.** It's the
profiler's "I considered, but didn't commit" log. Closed by default if
nothing relevant has happened in the last N turns; expands when activity
lands.

### Bottom region — the live anchor doc

Renders the markdown Subject Anchor as it currently stands. Re-renders
on every profiler write. Two visible affordances on top of plain
markdown:

- **Update markers** — each section header gets a `[✱ updated T<n>]`
  tag for the most recent profiler-pass that touched it. Helps the
  developer see which sections are stale (haven't moved in 8 turns —
  is that because they're solid, or because the profiler is dodging
  them?) vs. which are live.
- **Diff flash** — when a section changes on a profiler write, the
  changed prose briefly highlights (~600ms fade) so the eye catches
  the *what* of the update without having to read the whole doc each
  time. Implementation note: track per-section content hashes, flash
  on change.

**No editing.** This is read-only diagnostic surface. Editing the doc
mid-session would corrupt the profiler's working state and is a
non-goal.

### Other affordances

- **Verbatim log access.** A small icon / link at the top of the
  anchor region opens a separate scrollable list of the verbatim log
  entries (entry index, source, raw text). This is where you go to
  resolve `"said it 'preserves rest' — see entry 7"` references in the
  anchor prose. Doesn't need to be always-visible; collapsed by
  default.
- **Distribution snapshot** (optional, post-v1). The detective's live
  candidate-Dilemma distribution — top 3–5 candidates with confidence
  scores. Useful for catching the failure mode where one candidate
  dominates too early and the hunt stops exploring. Tuck into the
  profiler-workspace region as an expandable.

### Files to add / change

| File                                          | Change                                                                  |
|-----------------------------------------------|-------------------------------------------------------------------------|
| `src/debug/Debug.tsx`                         | Delete most key/value rows (keep `fps`, `app.phase`, `audio`, `viewport`, `errors.*`); shrink to a tiny top-right strip |
| `src/debug/DebugQueue.tsx`                    | **Delete.** Queue introspection is no longer central; if needed for development, fold into the profiler workspace as an expandable |
| `src/debug/ProfilerWorkspace.tsx`             | **New.** Top-of-left-column. Subscribes to a new `profilerActivityBus`  |
| `src/debug/AnchorView.tsx`                    | **New.** Bottom-of-left-column. Subscribes to the anchor store; renders markdown with update markers + diff flash |
| `src/debug/anchorBus.ts`                      | **New.** Pub/sub for anchor writes — emits on every profiler commit     |
| `src/debug/profilerActivityBus.ts`            | **New.** Pub/sub for profiler trigger + tier + draft output             |
| `src/debug/AgentActivity.tsx`                 | Unchanged — stays floating, tracks LLM lifecycle                        |
| `src/App.tsx`                                 | Replace `<DebugQueue />` mount with `<ProfilerWorkspace />` + `<AnchorView />` stack |
| `src/debug/debug.css`                         | Update left-column layout: full-height single column, top region collapsible, bottom region scrolls |

### Wiring contract

The profiler agent runner publishes to both buses on each pass:

```typescript
// after the profiler invocation completes:
publishAnchorWrite({
  turn: state.turn,
  trigger: 'heartbeat' | 'correction' | 'close',
  anchor: newAnchorMarkdown,
});

publishProfilerActivity({
  turn: state.turn,
  trigger,
  tier: 'haiku' | 'sonnet' | 'opus' | 'opus+thinking',
  draft_notes: profilerOutput.draft_notes ?? null,
  suspicions_raised: diffSuspicions(oldAnchor, newAnchor).raised,
  suspicions_dropped: diffSuspicions(oldAnchor, newAnchor).dropped,
});
```

Buses are debug-only — they don't drive any engine behavior, just the
panel. Profiler runner doesn't know or care if the panel is visible;
the bus has a noop subscriber in production.

---

## 18. Post-Phase-2 reassessment — backlog from brainstorm follow-up

Captured after Phase 2 shipped. These don't change Phase 3's direction
but should be considered before Phase 4 or whenever the survey gets a
walking test against real users.

### Pillar set is now 9, not 10

The `who_is_the_most_important_person_in_your_life` pillar was removed.
Reason: relationship/cast naming should be its own focused opener pass
once subject-first profiling is solid; mixing person-naming into the
initial Dilemma-locating set diluted both jobs. Pillars 7/8/9 in v3 are
the unsaid target / interior voice / avoiding question.

A future opener block specifically for relationship-naming (one or two
short relationship_pick items, before the survey starts hunting) lives
here in the backlog. Out of scope for the current refactor.

### The "altitude" axis — major / minor arcana mix

The brainstorm with an experienced reader surfaced this as orthogonal
to domain: major arcana = big archetypal forces, minor = daily-texture
stuff. The reader classifies by altitude before content. We didn't add
pillar questions for this in Phase 2, but it's worth considering: 1–2
short pillars that locate altitude (is this person sitting on something
life-shaping or texture-of-the-day?) would give the detective a second
orientation axis cheaply.

Status: backlog. Validate via Phase 4 walkthroughs whether the absence
of altitude hurts the first-assertion specificity. If yes, propose
1–2 pillar additions.

### Profile-the-problem-not-the-person — the experiment that reinforced our shape

A side experiment ran three readings (same cards) against three context
levels: cards-only / dilemma-only / full-profile. The result: profiling
the **situation** (dilemma) sharpened the reading substantially.
Profiling the **person's interior** committed the reading to a verdict
upstream — high reward when right, confidently wrong when off. The
judge ran an active argument against the dilemma-only version
(treating it as a live question) but engaged the full-profile version
as a fait accompli (treating it as a delivery of a foregone conclusion).

This validates the architecture we already built: the Suspicions —
DO NOT VOICE fence is exactly the discipline this finding asks for.
The Dilemma section holds the **situation** (asserted, committed).
Interior reads about the person stay in Suspicions (hedged, fenced,
never quotable downstream). The reading loop confirms the interior
live, from reactions, not from a pre-written profile.

What this means practically going into Phase 3:
- The profiler prompt already says "a guess does not become a fact
  without a test" — keep enforcing that.
- When assertions land (rejection-with-correction), the corrections
  ARE the interior reads — but they survived a test, so they're
  allowed to leave the Suspicions fence.
- Be conservative about the profiler promoting tentative interior
  reads to confident claims in the Unsaid section. The Unsaid is for
  patterns the **survey evidence** surfaced, not for the profiler's
  guesses about psychology.

Status: enforce in the Phase 3 detective prompt as part of the
falsifiability discipline.

### Assertion confirm/reject/correct rate is the v3 health metric

The brainstorm proposed: log every assertion with its outcome
(confirmed / rejected / rejected-with-correction). Watch the
rejection-with-correction rate specifically. If corrections are
frequent and specific, the detective is doing the real thing —
risky guesses, rich error signal. If everything's getting bland
confirmations, it's gone Barnum and you'll see it in the log
without needing a scoring rig.

Phase 3 bakes this in: assertions log their outcome on the PickEvent
and the debug panel surfaces the rolling rate.

Status: implement as part of Phase 3 instruments wave.

### Defensiveness + over-explanation are stance signals, not pillars

The brainstorm warned against pillar-questioning for people-pleaser /
defensive-about / burnout — those are **deltas** the detective should
discover via assertions, not pre-asserted via the survey (cop-sheet
failure). What is real, though: watching what answers come back with
defensiveness or over-explanation is free metadata, the closest thing
text-medium has to the flinch the in-person reader watches for.

Status: backlog. Phase 4+ could add a lightweight "over-explained"
flag derived from free-text answer length / latency outliers, kept
purely in the detective's working state. Stays out of the anchor.

---

## 19. Open seams — decisions left explicit

These are knobs the plan deliberately doesn't pin down, so they can flip
without rewriting:

- **Mascot stall lines: detective-generated vs templated.** Currently the
  plan has the detective emit them per-assertion. Cheaper alternative: keep
  a pool of canned in-character lines in `materials/mascot/stall-lines.md`
  and pick one by category (true/false/correction-coming) deterministically.
  Detective-generated is more contextual; templated is zero-cost. Pick at
  build time based on cost-vs-quality after Phase 3.
- **Pillar order.** The SEED phase asks 10 in fixed order today. Open whether
  the detective can reorder the *last three* pillars (8/9/10) based on what
  pillars 1–7 reveal. Doesn't need to land in v3; flag it.
- **Anchor template.** Treat §12 as v1. Run Phase 5 experiments against
  alternatives.
- **Profiler heartbeat cadence.** Set to "every 3 turns" as a starting
  guess. Tune on observation.
- **Dead-end thresholds.** N=6 (distribution-flatness window), K=3 (None /
  rejection-without-correction streak). Starting guesses.

---

## The one-line version

Run a 10-pillar SEED then a detective-driven explore/exploit loop that spends
every tap on maximum-information-gain tests against the model's prior over
Dilemmas (deltas rendered as forks-with-do-nothing-branches) — detective
(Sonnet, every turn, owns distribution) proposes assertions with pre-baked
mascot stall lines; profiler (Haiku→Sonnet→Opus by phase, every 3 turns +
on corrections + close) records what survived a test as prose in a swappable
markdown anchor — until one Dilemma wins with specificity, or content-level
dead-end signals fire and we land null gracefully without inventing a crisis.
Output a short prose anchor plus an immutable verbatim log.

Everything about the template is a hypothesis; everything about the engine
behavior is the lesson.
