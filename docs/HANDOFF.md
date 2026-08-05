> **STATUS (2026-08-05): point-in-time onboarding for the turtle-era build — the code it describes is DEAD
> CODE** (no route reaches it since the three-door menu). The living
> docs are `docs/SESSION-V2.md` + `docs/ENSEMBLE.md`. Historical.

# Handoff — tarobot, the tuning-pipeline rebuild

**Point-in-time snapshot (2026-06-11).** A handoff for a fresh agent picking up
the antechamber rebuild. It is dated and WILL go stale — when it contradicts the
code, the code wins; then `docs/PIPELINE.md`; then `CLAUDE.md`; then this. Delete
sections as they rot.

## Read order

1. `CLAUDE.md` — durable orientation (principles, conventions, architecture).
2. `docs/PIPELINE.md` — the living truth for the antechamber pipeline.
3. This doc — current state, the lessons, and the brainstorm context the repo
   docs don't carry.

## Where the project is right now

The antechamber was rebuilt from scratch this arc. The old engine
(`src/pipeline/antechamber/` — pillars / weaver / diviner / compiler) is LEGACY:
still wired only for the loaded / returning-user path, being retired. The
go-forward pipeline is **Survey → Scribe → Condenser → Conjector → (Compiler)**,
all shipped and playable off `main`/prod EXCEPT the Compiler.

| Stage | State | Where |
|---|---|---|
| Survey — deterministic, NO AI; 14 facets → RawPortrait | ✅ shipped | `src/pipeline/introduction-survey/`, `materials/survey.json` |
| Scribe — write-in → channels (Haiku, parallel, joined before Condenser) | ✅ shipped | `src/pipeline/tuning/writeInEnricher.ts`, `materials/prompts/scribe.md` |
| Condenser — RawPortrait → markdown Portrait (Sonnet freeform; draft fallback) | ✅ shipped | `src/pipeline/tuning/condenser.ts`, `materials/prompts/condenser.md` |
| Conjector — cold/warm/hot dilemma hunt (budget-paced; negative-space stack) | ✅ shipped | `src/pipeline/tuning/ConjectorAgent.ts`, `materials/prompts/conjector/` |
| Compiler — deepen pool / experts / deal / cheat / Conjector→Seer bridge | ❌ UNBUILT | `deepen()` stub in `ConjectorAgent.ts` |
| Reading — the seer (director / actor) | ✅ exists, unchanged this arc | `src/pipeline/seer/`, `docs/READING-ANATOMY.md` |

```
SURVEY  →  SCRIBE  →  CONDENSER  →  CONJECTOR  →  [COMPILER]  →  [READING]
14 facets  write-ins  Portrait(md)   dilemmas      UNBUILT        the seer
no AI       Haiku       Sonnet        Sonnet
```

The new flow currently **dead-ends at `TuningDone`** — it dumps the
`ConjectorResult` JSON and stops. It does NOT reach the reading: the
**Conjector→Seer bridge is the missing link.** Persistence (Person records,
returning-user match) is also legacy-only; the new survey path doesn't persist.

Survey and Conjector both drive the same portable **rails**
(`src/pipeline/rails/` — `current()` / `submit()` / `subscribe()`), so the UI is
a thin renderer and the business logic can lift to a backend later. The
`TuningEngine` paints the Portrait and hosts ordered `Agent`s (each Agent IS a
RailDriver); the Conjector is activity #1; a new activity is a new Agent.

## The lessons (the design philosophy)

The throughline of the whole rebuild: **structure the dataflow, not the model's
thinking.** Every time structure got added around the model's *reasoning*, the
owner cut it; every win came from making the *data between agents* explicit.

- **Budget, not gates.** The Conjector commits when ready, capped by a move
  budget (5) — NOT gated on "collect N anchors → form a hypothesis → commit."
  An upfront hypothesis flattens the implicit space the model works best in.
- **Markdown, not schema, for AI→AI.** The Portrait is prose, not a Zod schema.
  Schemas are for boundaries you DON'T trust (LLM→code tool calls); prose carries
  the nuance between models. (Tool I/O still uses Zod — that's the trusted/
  untrusted boundary distinction.)
- **Explicit negative space, not blind isolation.** Re-root does NOT run "blind"
  to prior threads — running blind collides on the loudest charge. Each thread
  emits a one-line HYPOTHESIS onto a stack, fed forward so the next search must
  open territory OUTSIDE it.
- **No bolt-on meta-judge.** The agent holding the full transcript self-assesses;
  don't add an external comparator.
- **Charge over truth.** A guess that lands HOT beats one that's true-but-inert; a
  specific wrong guess (that invites correction) beats a vague safe one.
- **Mirror, not oracle.** The reading illuminates the user's relationship to a
  fork; it never predicts. Win condition = feeling *seen*, not seeming prescient.

## Brainstorm context the repo doesn't carry

The authoritative specs for the wider installation live in the owner's Google
Docs (Antechamber, Reading, Infrastructure, Body, Lantern, Stagecraft). This is
orientation so the references don't blindside you.

**The installation (Burning Man).** Tarobot is one *show* in a multi-tent
installation. A central compute hub — **Obelisk** — sits in a lobby tent and
serves the **Antechamber** web app over local wifi to **Players'** phones in
line. The Antechamber doubles as queue + experience pre-load (the wait isn't
dead time). Nouns: **Player** (visitor), **show** (a tent's experience),
**session** (a visit). The queue/ticket module is the **Box Office** (a.k.a.
"Box Turtle"): slot reservation with a ~10s confirm window (solves the
double-book race), a slot state machine, operator controls.

**The full Tarobot pipeline (intended, beyond what's built).** Universal intake
(name / vibe-check / consent / age) → show selection + Box Office → per-show
intake (Tarobot's is the TuningEngine) → **Compilation** → handoff to the tent.
The Conjector's `deepen()` seam feeds Compilation: a fan-out of **expert agents**
(candidate set: Psychologist, Mythologist, Tactician, Shadow — TBD), the
**Augur** (outcomes / per-card symbology), the **Deal** (card RNG), and **the
Cheat** (an agent may swap exactly one drawn card for a Major Arcana that
sharpens the reading — target ~20–30% of readings, never disclosed). Cards are
dealt at COMPILE time (not at the table) to hide latency; per-card director Sets
are pre-computed. Owner's calls: compilers run at the END of the Conjector (not
pipelined per-thread), and designing the expert set is deferred.

**The Reading engine (the seer — separate subsystem, mostly untouched this
arc).** A 4-card diamond, mirror-not-oracle. **cognition/persona split** =
**director** (offstage, structured tool calls, plans *understanding*) / **actor**
(onstage, voiced — the seer). Director runtime is cloud, actor is local. An
inline-cognition transcript interleaves `[cog:]` / `[emote:]` / `[card:]`
annotations (append-only, caches well). Slot meanings are load-bearing: top =
what they bring in, left/right = the unseen on each fork path, bottom = the
unaddressed factor. Roadmap (not built): the **Parliament of Drives** (the
persona as competing drives — Reader / Companion / Edge / Restlessness /
Reticence — adjudicated) and a **backup mode** (local 7B + pre-authored trees)
for Obelisk-disconnect. ~23 LLM calls per reading. Detail: `docs/READING-ANATOMY.md`.

**Other tents (hardware, owner's Google Docs).** **Body** = the animatronic seer
(InMoov-based, custom mask, LCD eyes behind cabochon lenses). **Lantern** =
projection mapping (a projector projects the cards onto the table; the Player
taps cards to flip; depth-cam or touch). **Stagecraft** = AV / ambiance
(lighting, sound, haze) — cheap by design, spend only on what counts.

## Naming registry (settled)

Player · show · session · Box Office (Box Turtle) · the Lineup (the survey) ·
**Scribe** · **Condenser** · **Conjector** — the dilemma hunter, was Diviner,
then Detective / Dowser / Sounder; **now Conjector EVERYWHERE, no prompt alias**
(do NOT reintroduce "Diviner" for this agent — the legacy antechamber has its own
separate `diviner`) · the Cheat · **Clat** (the turtle / familiar / the
Antechamber's voice) · the seer (unnamed) · Obelisk (compute hub).

## Open / next (owner-prioritized)

1. **The Compiler arc** — experts + brief assembly + the Deal + the Cheat + the
   **Conjector→Seer bridge** (the missing link to an actual reading). The big one.
2. **TUNE DEMO** — a menu shortcut that skips the survey with a fixed RawPortrait
   fixture, for fast Conjector iteration (mirrors the existing READ DEMO).
3. **Condenser cast split** — if "Cast" reads weak against real players, peel it
   into a parallel Haiku (surgical, not upfront).
4. **Eager Scribe** — fire write-ins DURING the survey to hide their latency
   (today they're joined at close).
5. **Latency-cover beats** — replace the bare "…" between guesses with the
   "reflection" (show the Player a pick of theirs back).
6. **Retire `pipeline/antechamber/`** + bring persistence / returning-user onto
   the new path.

## How to work here

- **Deploy = push to `main`.** Vercel auto-deploys (`jakekidds-projects` scope,
  NOT Ubitel). The owner tests off main/prod — keep it green (typecheck + lint +
  build) before every push.
- **Commits:** `type(scope): lowercase one-liner`, no co-author trailer, mirror
  recent `git log`.
- **The owner reverses fast.** Hold decisions loosely; make commitments cheap to
  revert and FLAG ambiguous interpretations rather than silently overriding a
  stated preference.
- **No detective theater** — in the UX (don't corner low-effort users) and in
  collaboration (propose + let the owner redirect; don't grill with prerequisite
  questions).
- **Honest framing.** Label stand-ins as stand-ins (the draft Portrait, the bare
  "…" stalls, the stubbed `deepen()`). Don't oversell.
- **Closed-loop discipline.** Don't refactor upstream before the downstream
  consumer can show what signal it needs — this is why the reading was built
  before the antechamber was rebuilt.

## First task

Take the survey on prod (`begin`), play the Conjector, read the dumped
`ConjectorResult`. The system's behavior is the spec. Then the highest-leverage
build is the **Conjector→Seer bridge** (so a hunt becomes an actual reading) or
the **TUNE DEMO** shortcut (so iteration stops costing 14 questions a run).
