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

CONJECTOR  (ConjectorAgent — "the Diviner" in its prompt; cognition / Sonnet)
  the cold/warm/hot dilemma hunt. drives the SAME rails the survey drove:
    guess    → player taps COLD / WARM / HOT
    reframe  → player taps YES / NO   (the question UNDER their question)
    thinking → a model call is in flight
  per thread: budget ≤5 moves; the Diviner narrows in its own implicit space
  and emits a guess OR the committing reframe each move, FORCED to commit by
  the last. close on YES (confirmed) or a spent budget (soft).
  between threads: a RE-ROOT call finds a genuinely different territory or
  declares the field exhausted (the soft-out). caps: ≤3 threads, ≤15 moves.
  banks a Dilemma per thread (reframe + first-person summary_md + claimed
  leads + confirmed flag). deepen() fires on each close — STUBBED.
  output: ConjectorResult { dilemmas[] }, unranked.

        ↓

COMPILER  (the deepen arc — NOT BUILT)
  per-dilemma expert / pre-calc fan-out (psych, mythology, …) + brief
  assembly + the card deal + the cheat. fires off the deepen() seam.
  open design: which experts, run-at-end vs pipelined-per-close, and how
  dilemmas + experts assemble into the Seer's brief.

        ↓

READING  (out of scope here — docs/READING-ANATOMY.md)
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
| CONJECTOR | hunt | cognition / Sonnet · local | "Diviner" in prompt. three ops: move (guess/commit) · reroot · summary. budget-paced. |
| (deepen) | compile | — | STUBBED. the Compiler arc. |

Runtime `local`/`cloud` is the prod-deployment designation (see CLAUDE.md
"Local vs cloud"). Today every call is Claude scaffolding.

Naming: in CODE the hunter is the **Conjector**; in its PROMPT it is the
**Diviner** (the mystic frame sharpens the guesses — deliberate; do not
collapse the two). All five prompts live in `materials/prompts/`
(`condenser.md`, `scribe.md`, `conjector/{move,reroot,summary}.md`) — `?raw`
imports, so they tune on GitHub without a code change.

---

## Load-bearing principles (these survive the churn)

- **Portrait is markdown, not a schema.** AI-for-AI context is prose blobs.
  The Condenser writes prose the Conjector reads.
- **Fidelity in the survey.** Weight only SORTS the amalgam; it never gates
  or drops. The RawPortrait is a lossless reflection of the picks.
- **COLD / WARM / HOT is absolute, not gradient.** COLD eliminates a region;
  HOT confirms. The **reframe** (the depth under the surface dilemma) is the
  payload — not the stated dilemma.
- **Budget-paced, not anchor-gated.** The Diviner commits when ready, forced
  by the last move; it keeps the implicit room it works in. No hypothesis
  upfront, no separate specificity-comparator.
- **Re-root finds DIFFERENT territory.** Each thread runs blind to prior
  transcripts (fresh state — kills the elephant). One real dilemma beats
  three forced ones; re-root may declare the field exhausted.
- **Never manufacture.** Exhausted is a valid terminal state. Ship fewer real
  dilemmas over inventing one.
- **Mirror, not oracle** (carries into the reading): name what is, don't
  foretell.

---

## In flight / next (high-signal, expect change)

1. **The Compiler arc (the deepen pool).** `deepen()` is stubbed. Open:
   which experts / pre-calc per dilemma; run-at-end-of-Conjector vs pipelined
   on-close; how dilemmas + experts assemble into the Seer's brief; the card
   deal + the cheat. The Conjector→Seer bridge is unbuilt — the Seer still
   consumes the OLD compiler's DilemmaDocument (docs/DILEMMA-SCHEMA.md) on the
   loaded path.
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
