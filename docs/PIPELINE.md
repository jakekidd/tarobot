# Tarobot Antechamber Pipeline — current shape

Living doc. The source of truth for "what's actually running" between a new
visitor arriving and the Seer reading them. When a section starts to lie, fix
it rather than patch around it.

> **Architecture in transition.** This pipeline was rebuilt. The go-forward
> path is **Survey → Scribe → Condenser → Conjector → (Compiler)**, living
> under `src/pipeline/introduction-survey/` and `src/pipeline/tuning/`, driven
> over the portable **rails** (`src/pipeline/rails/`). The PRIOR engine
> (`src/pipeline/antechamber/` — pillars / weaver / diviner / compiler) still
> serves the **loaded / returning-user** path and is being retired. This doc
> describes the new path; treat `pipeline/antechamber/` as legacy.

---

## The shape

```
SURVEY  (IntroductionSurvey — deterministic, NO AI, Node-portable)
  name → 14 facet questions → birthdate → done
  each pick staples its authored channels (materials/survey.json) into a
  RawPortrait; every declined option contributes its shadow. write-ins are
  captured with EMPTY channels (free_text=true) for the Scribe to fill.
  output: RawPortrait — weight-ranked amalgam. FIDELITY: weight only SORTS,
  it never gates or drops.

        ↓ survey close

SCRIBE  (writeInEnricher — fast / Haiku, one call per write-in, parallel)
  enriches each free-text answer into the channels an authored option carries
  (+ weight, shadow, free-form notes). JOINED before the Condenser. no
  write-ins → no calls.

        ↓

CONDENSER  (condense — cognition / Sonnet, one freeform call)
  RawPortrait (+ scribe enrichments) → the Portrait: a markdown vignette,
  NOT a schema. synthesis, not extraction. sections:
    central leads (confidence-tagged HIGH/MEDIUM/LOW/HUNCH) · patterns ·
    tensions · cast · posture.
  failure → draftPortrait fallback (raw amalgam laid out) so the flow runs.

        ↓

CONJECTOR  (ConjectorAgent — cognition / Sonnet)
  the cold/warm/hot dilemma hunt. drives the SAME rails the survey drove:
    guess    → player taps COLD / WARM / HOT
    reframe  → player taps YES / NO   (the question UNDER their question)
    thinking → a model call is in flight
  per thread: budget ≤5 moves; the Conjector narrows in its own implicit space
  and emits a guess OR the committing reframe each move, FORCED to commit by
  the last. close on YES (confirmed) or a spent budget (soft).
  on close it emits a one-line HYPOTHESIS onto a NEGATIVE-SPACE STACK; every
  later move + the RE-ROOT read that stack and must open territory OUTSIDE it
  (without it, threads collide on the same charge). re-root finds a genuinely
  different territory or declares exhausted. caps: ≤3 threads, ≤15 moves.
  banks a Dilemma per thread (reframe + hypothesis + first-person summary_md +
  claimed leads + confirmed flag). deepen() fires on each close — STUBBED.
  output: ConjectorResult { dilemmas[] }, unranked.

        ↓

COMPILER  (naive v1 — src/pipeline/compiler/)
  the clean-cut seam: AntechamberOutput in → CompiledBrief out → the
  reading consumes CompiledBrief and nothing upstream of it.
  naive v1 = the card deal (compile time, 4-card diamond) + ONE cognition
  call (materials/prompts/compiler/brief.md) that extrapolates the
  core-story prose brief — CARD-BLIND, so per-card directors never see
  unflipped faces — + an honest mechanical Profile assembly (dilemmas →
  hunches; nothing invented). outcomes: [] for now.
  NOT YET BUILT (the in-depth compiler): the expert fan-out (psych,
  mythology, …), the Augur outcome docs, the Cheat, per-card pre-calc off
  the deepen() seam.

        ↓

READING  (out of scope here — docs/READING-ANATOMY.md)
  reachable E2E: TuningDone → "enter the tent" → compile → Seer. the
  Seer accepts a Compiler-supplied prose_brief (skips directorIntro,
  actor still voices the intro).
```

---

## The rails (the portable seam)

Survey and Conjector are both `RailDriver`s (`src/pipeline/rails/types.ts`):
`current()` returns a `RailStep` the UI renders; `submit()` feeds the user's
action back; `subscribe()` triggers a re-render. The UI
(`IntroductionSurveyScreen`, `TuningScreen`) is a thin renderer that does not
know which concrete driver is on the other end — so the business logic can
lift to a backend later without the UI noticing. New step kinds
(`guess` / `reframe` / `thinking`, inputs `temp` / `verdict`) grow the union
by ADDING a case, never by changing the shape every driver depends on. The
`TuningEngine` paints the Portrait (Condenser) and hosts ordered `Agent`s
(each Agent IS a RailDriver); the Conjector is activity #1. A new activity is
a new Agent, not surgery on a monolith.

---

## Active agents

| Agent | Stage | Tier / runtime | Pattern |
|---|---|---|---|
| (survey) | survey | deterministic, no LLM | 14 facets → RawPortrait. pure lookup. |
| SCRIBE | survey close | fast / Haiku · local | one call per write-in, parallel, joined before the Condenser. |
| CONDENSER | condense | cognition / Sonnet · cloud | one freeform call. RawPortrait → markdown Portrait. |
| CONJECTOR | hunt | cognition / Sonnet · local | three ops: move (guess/commit) · reroot · summary. budget-paced; negative-space stack; per-move `dimension` fed back for coverage. |
| COMPILER | compile | cognition / Sonnet · cloud | naive v1: one card-blind narrative call + the deal + profile assembly. `deepen()` (per-dilemma expert pre-calc) still STUBBED. |

Runtime `local`/`cloud` is the prod-deployment designation (see CLAUDE.md
"Local vs cloud"). Today every call is Claude scaffolding.

All five prompts live in `materials/prompts/` (`condenser.md`, `scribe.md`,
`conjector/{move,reroot,summary}.md`) — `?raw` imports, so they tune on GitHub
without a code change. (The legacy `pipeline/antechamber/` has its own,
separate `diviner` — not this Conjector.)

---

## Load-bearing principles (these survive the churn)

- **Portrait is markdown, not a schema.** AI-for-AI context is prose blobs.
  The Condenser writes prose the Conjector reads.
- **Fidelity in the survey.** Weight only SORTS the amalgam; it never gates
  or drops. The RawPortrait is a lossless reflection of the picks.
- **COLD / WARM / HOT is absolute, not gradient.** COLD eliminates a region;
  HOT confirms. The **reframe** (the depth under the surface dilemma) is the
  payload — not the stated dilemma.
- **Budget-paced, not anchor-gated.** The Conjector commits when ready, forced
  by the last move; it keeps the implicit room it works in. No reframe-shaped
  hypothesis upfront, no separate specificity-comparator.
- **Re-root finds DIFFERENT territory via a negative-space stack.** Each closed
  thread emits a one-line HYPOTHESIS; the stack of them feeds into every later
  move + the re-root, which must open territory OUTSIDE it. Running the search
  blind collides on the same charge — this stack is the fix. One real dilemma
  beats three forced ones; re-root may declare the field exhausted.
- **Never manufacture.** Exhausted is a valid terminal state. Ship fewer real
  dilemmas over inventing one.
- **Mirror, not oracle** (carries into the reading): name what is, don't
  foretell.

---

## In flight / next (high-signal, expect change)

1. **The in-depth Compiler (the deepen pool).** Naive v1 shipped (one
   narrative call + the deal). Still open: the expert fan-out (which
   experts; run-at-end vs pipelined on `deepen()`), the Augur outcome docs,
   the Cheat. The legacy loaded path still consumes the OLD compiler's
   DilemmaDocument (docs/DILEMMA-SCHEMA.md).
2. **Eager Scribe.** Today the Scribe fires at survey close (joined before the
   Condenser). The latency-hide — firing each write-in eagerly DURING the
   survey so it finishes under the remaining questions — is deferred (needs a
   survey-screen observer + App orchestration).
3. **Latency-cover beats.** Each guess is a ~10s Sonnet call behind a bare
   "…" stall. The reflection beat (show the player one of their picks back) is
   unbuilt.
4. **Condenser quality.** One Sonnet call. If a section (tensions especially)
   proves weak against real players, peel just that into a parallel Haiku —
   surgical splits over upfront parallelism.
5. **Retire `pipeline/antechamber/`.** The loaded / returning path still runs
   the old engine. Migrate it onto survey→tuning, then delete.
