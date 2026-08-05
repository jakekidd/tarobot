# tarobot — agent onboarding

> **START HERE (2026-08-05): `docs/LANDING-PROGRAM.md` is the current
> program AND the onboarding for this build cycle** — first principles
> (each law with its scar), verified defect ledger, staged plan
> S0-S4 with gates. Read it whole before touching anything.

This file is the durable orientation for any agent picking up this repo. It
trades implementation detail for principle, because the implementation is
churning faster than docs can keep up. When a section starts to feel brittle,
delete it rather than patch it.

**For the current pipeline shape, read `docs/PIPELINE.md` FIRST.** That doc
is the living source of truth for which agents fire in which phase, what
they read, what they emit, and the load-bearing principles.

Documentation map (what to trust for what):

| Doc | Scope |
|---|---|
| `CLAUDE.md` (this file) | Durable orientation — principles, architecture, conventions. |
| `docs/PIPELINE.md` | Living truth for the antechamber pipeline (survey → condenser → conjector). |
| `docs/ENSEMBLE.md` | Living truth for the oracle ensemble + xray lab + booth demo, web AND headless. |
| `docs/LANDING-PROGRAM.md` | THE CURRENT PROGRAM + onboarding: first principles, defect ledger, stages S0-S4, gates. Start here. |
| `docs/SESSION-V2.md` | The beat grammar — session flow, delivery, testing protocol. Supersedes older arc sections everywhere. |
| `docs/experiments/EVAL-METRICS.md` | The obfuscated-profile eval — named metrics, defined before runs. |
| `docs/experiments/PERSONA-SEARCH.md` | The persona investigation — research conclusions, tacky metrics, the vesper lineage. |
| `docs/experiments/NORTH-STAR.md` | The UX yardstick + tacky taxonomy (T1-T6), written before the audit loop. |
| `ENSEMBLE-PLAN.md` | The build plan that produced the ensemble. Rationale mine; historical. |
| `docs/HANDOFF.md` | Point-in-time onboarding: current build state, lessons, brainstorm context. |
| `docs/ANTECHAMBER-STATE.md` | Point-in-time close-out audit of the antechamber (checklist, gaps, deferred). |
| `docs/ANTI-RUBRICS.md` | The failure-mode catalog (AR-ids) the behavioral rig audits transcripts against. |
| `docs/READING-ANATOMY.md` | The Seer reading engine (director/actor, tranches). |
| `docs/DILEMMA-SCHEMA.md` | The DilemmaDocument contract — LEGACY compiler output → seer input (still feeds the reading on the loaded path). |
| `TODO.md` | Deferred-work backlog. |
| `materials/` | All authored text (survey.json, prompts) — edited live. |
| `REFACTOR-V3.md` | Older planning context; lags reality. Historical only. |

When two docs disagree, the code wins; then `docs/PIPELINE.md`; then this
file. Fix the loser.

---

## What this is

A tarot-themed web app. The visible product is the oracle session:
key entry → a three-door menu (demo / xray lab / settings). The DEMO
is the booth in 3d — floating eyes over a red table, subtitles, a
rant-first interview, a spread dealt to the visitor's dilemma (they
deal it by tapping the deck, flip at their pace), the naming ritual,
a quest at the close. The XRAY LAB is the same engine with the skull
open. The old turtle/antechamber/seer flow is dead code. The reading
is the thing the rest exists to serve.

Deploy is Vercel static. The browser holds the user's Anthropic API key and
calls the model directly — there is no backend, no database, no auth layer.
Persistence is `localStorage` only. The pipeline library
(`src/pipeline/`) is structured to run unchanged in Node so the eventual
production system can swap the browser-direct call for a server-held key
without touching pipeline code.

In prod, this app runs on an on-prem booth computer at a music festival
(Burning Man). The booth serves the antechamber page over its local hotspot/LAN
to phones in line. The reading happens at the booth itself with a real-
robot Seer. Latency budget shapes the runtime split below.

Owner: jakek. Project tone is dark, game-feel, sparse. Pixel / ASCII /
unicode-glyph aesthetic. CRT scanline overlay, three.js turtle mascot as
full-screen backdrop, monospace typography in places. No emoji unless
explicitly asked.

---

## Materials (text-shaped artifacts) live at `materials/`

Everything text-shaped that authors / agents tune is in the
`materials/` directory at the repo root. Loaded into TS via Vite `?raw`
imports so non-coders can edit on GitHub and Vercel rebuilds with the
new content.

```
materials/
  survey.json                     the 14-facet survey (questions + per-option channels)
  prompts/
    condenser.md                  RawPortrait → markdown Portrait (sonnet)
    scribe.md                     enrich a write-in into channels (haiku)
    conjector/
      move.md                     the cold/warm/hot guess loop (conjector)
      reroot.md                   find a different territory, or declare exhausted
      summary.md                  first-person dilemma close for the compiler
    augur-outline.md              outcome naming (binary/ternary/open)   [reading]
    augur-fill.md                 outcome document fills (markdown prose) [reading]
    seer/
      voice-bible.md              shared craft for all actors
      director-intro.md           prose-brief from the Dilemma
      director-per-card.md        per-card Set (given circumstances)
      director-closing.md         ClosingIntent + held-probe swing
      actor-intro.md              one-line voiced intro
      actor-per-card.md           voiced beat from a Set
      actor-closing.md            voiced outro
      actor-chat.md               between-beats reply
    # LEGACY (antechamber engine, retiring): weaver.md · diviner.md ·
    # compiler.md · intention-suggestor.md · mantra.md
    ensemble/
      driver.md · wildcard.md · interpreter.md · profiler.md ·
      conjector.md · attention.md   one system prompt per ensemble
                                agent; wildcard.md is VESPER — the
                                predict-a-human persona (see
                                PERSONA-SEARCH.md)
  ensemble/
    beats.json                    the beat library (SESSION-V2 §3): V
                                  variants + T skeletons with typed slots
                                  (greeting, rant bids, question frames,
                                  per-class deals, focus gate, naming
                                  incantations, quest lead, charm, closes)
  oracle/
    deck/                         the Deck Bible — full 78-card RWS, one json
                                  per suit + majors; symbols/themes/shadow/
                                  charge/voice_note per card (readers: the
                                  oracle compile + ensemble flip enrichment)
  names/
    masc.txt                      relationship_pick name bank (one per line)
    fem.txt
  mascot/
    return-lines.md               canned mascot lines for returning RESUME
  # LEGACY (9-pillar antechamber): pillars.md · templates/{profile,anchor}.md
```

## Antechamber engine — the artifacts (survey → tuning)

> Phase-by-phase truth lives in `docs/PIPELINE.md`; this is the orientation.
> The pipeline was rebuilt. The older "three artifacts" (profile /
> investigation / story, from an observer + diviner) are LEGACY — they belong
> to `src/pipeline/antechamber/`, which still serves the loaded / returning-
> user path and is being retired.

The go-forward path runs **Survey → Scribe → Condenser → Conjector**, over the
portable rails (`src/pipeline/rails/`). Three artifacts move down it:

- **RawPortrait** (the survey's output · deterministic, NO AI) — every facet
  pick with its authored channels (indicators / implications / identities,
  plus the declined options' shadows), weight-ranked. Weight only SORTS, it
  never gates. Write-ins ride through with empty channels for the Scribe.
- **Portrait** (the Condenser's output · one Sonnet call) — a *markdown*
  vignette, NOT a schema: central leads (confidence-tagged HIGH/MED/LOW/
  HUNCH), patterns, tensions, cast, posture. The read the Conjector hunts off.
- **dilemmas** (the Conjector's output) — each a located charge: the
  **reframe** (the question under their question, confirmed YES/NO by the
  player), a first-person `summary_md`, the leads it claimed, and a confirmed
  flag. These hand to the (unbuilt) Compiler, then the Seer.

## The user-facing voice during the antechamber

The turtle (the mascot) is the only thing the user sees and hears — reactive,
RPG-dialogue style, lowercase. The reasoning agents are SILENT: the Condenser
and the Conjector never surface their
thinking to the user. If a future implementation prints the Conjector's
internal guess-reasoning, or the Portrait, to the user, that's a regression of
this load-bearing rule.

## The survey facets

The survey is **14 facets** (`materials/survey.json`), one-tap multiple
choice, each option pre-authored with channels. It replaced the older 9-pillar
/ observer-category model:

```
basics · relationship-status · work · social · joys · rest · body ·
change · conflict · attachment · ego · family · yearning · agency
```

Each option carries indicators (facts), implications (leads), identities
(competing character-types), a shadow (what NOT picking it means), and a 0–3
weight. Authoring discipline + the full list live in `materials/survey.json`.

---

## Load-bearing principles

These shape design decisions everywhere downstream. When in doubt, return to
these before adding cleverness.

### Mirror, not oracle

The reading does not predict outcomes. The reading illuminates the user's
relationship to a fork they are standing at. Cards do not foretell — they
constrain. Each card's job is to license one specific angle on the user at
the threshold. The win condition is the user feeling *seen*, not the system
appearing prescient.

Operationally: the Seer must not advise, moralize, or assign verdicts.
"You will…" / "you should…" / "the answer is…" are failure modes. "You are
carrying X into this" / "the part you are not looking at is Y" are the
register.

### Director plans, actor performs

In the Seer, the **director** (structured tool calls) is offstage. It holds
the whole arc, models the user on multiple timescales, and produces
*understanding* — not lines. The **actor** (also a model call, voiced) is
onstage. It receives the director's notes and improvises the actual
utterance in-character.

The split exists because alignment-trained models pull toward
helpful-and-clear, which is the opposite of what the Seer needs.
Asking one model to both reason carefully *and* perform character at once
collapses the reasoning. Keep them separated.

The thematic restatement: the Seer is a medium. The director is what she
channels. There really is an intelligence whispering to her that she does
not fully see. Architecturally and narratively, the same shape.

(Historical note: this split was called `cognition` / `persona` until the
runtime category — `local` / `cloud`, see below — overloaded "cognition.")

### Cards as constraints

Random card draws are not noise to compensate for. They are the engine that
forces the director into one narrow angle on this specific person. The
constraint-satisfaction surprises both reader and seeker — that surprise is
where the hair-on-the-back-of-the-neck comes from.

### Structural prediction, not specific

"You will lose your job on Tuesday" is unfalsifiable and not the goal.
"You are in a dissolution that is giving way to consolidation; what you cling
to in the dissolution will limit the consolidation" is the goal. Hand the
user a lens they can carry, not a prediction they can verify.

### Co-authorship — under-specify on purpose

Specificity is sparing and surgical. "I see a parting, and you already know
what that means, don't you?" beats "you will leave your partner." The user
fills in meaning; they feel seen because *they* made the connection. The
system under-specifies on purpose and trusts the user to land it.

### No detective theater (antechamber rule)

The antechamber must not weaponize silence, corner the user, or punish low effort.
A user who picks vague options or passes should not feel cross-examined.
The historical failure mode this guards against: a smug investigator agent
that ramps difficulty in response to non-engagement, killing the session.
The investigator's job is to deduce *while keeping the room warm*.

### Local vs cloud (runtime category)

Every agent is designated **local** or **cloud**. The category is about
*where the call goes in prod* — not about model size, which is a separate
concern (`fast` / `cognition-tier` / `deep` in `src/pipeline/claude.ts`).

- **local** runs on the booth's on-prem LLM (an OSS model on a local box).
  Used for everything in the critical-latency path: antechamber-time agents
  (weaver, diviner, compiler) that fire every turn, and the
  seer's actor (which the user hears voiced in real-time). Today these
  are all satisfied by Claude as scaffolding — the local-LLM swap is the
  eventual replacement, and the `LLMAdapter` interface is the seam.

- **cloud** stays on the Anthropic API. Used where latency is tolerable
  because the call is one-shot (shaman, augur) or parallel-with-voice
  (the seer's director runs while the actor is already speaking the
  previous beat). Reasoning quality matters more than wall-clock here.

This split is load-bearing for the festival deployment: cloud calls cost
network round-trip + provider variance, which is fatal on the per-turn
antechamber loop. The pipeline page (`src/ui/Pipeline.tsx`) makes the
designation visible per agent.

### Mirror through the seams

Both halves of the experience already wear this shape — the antechamber reconstructs
who the user is from evidence they didn't realize they were giving (already
seer-shaped, not assistant-shaped), and the reading illuminates the user to
themselves. Lean into "I see you," not "I will tell you the future."

---

## Architecture, at the right altitude

Three layers, top to bottom:

1. **UI** (`src/ui/`, `src/App.tsx`) — React 19, Vite 7, TypeScript strict.
   Phase-machine `App.tsx` switches between screens. No business logic in
   components beyond phase routing and adapter construction.
2. **Pipeline** (`src/pipeline/`) — Node-portable. Owns engines, prompts,
   schemas, adapter, static data (cards, spreads, personas, the dialogue
   tree). The product. (`personas` here means the catalog of seer
   characters like Marisol — NOT the runtime layer, which is now `actor`.)
3. **Persistence + bootstrap** (`src/storage.ts`) — `localStorage` wrapper
   for the API key, sessions, settings. Sits outside `src/pipeline/` so the
   pipeline stays browser-portable.

The pipeline is structured so that every model call routes through an
`LLMAdapter` interface. Concrete impl (`AnthropicAdapter`) is the only thing
that imports `@anthropic-ai/sdk`. Tier names (`fast` / `cognition` / `deep`)
abstract over model IDs — the tier→model mapping lives in one file and is
the only place to change models. (Note: `cognition` here is a model-size
tier name — Sonnet — distinct from the runtime category "cloud" and from
the old layer name "cognition." Plan to rename the tier eventually, but
not load-bearing yet.)

### Survey + Tuning engines (`src/pipeline/introduction-survey/`, `src/pipeline/tuning/`)

The go-forward antechamber (full shape in `docs/PIPELINE.md`). Two engines
over the shared rails (`src/pipeline/rails/`):

- **IntroductionSurvey** — deterministic, NO AI, Node-portable. Walks the 14
  facets and rounds picks up into a RawPortrait. A `RailDriver`
  (`current()` / `submit()` / `subscribe()` / `result()`); no model SDK, no
  DOM. Heat/phase machinery is gone — it's a fixed-order walk.
- **TuningEngine** — runs after the survey. Paints the Portrait (the
  **Condenser** — one Sonnet *freeform* call), then hosts ordered **Agent**s
  that drive the same rails. The **ConjectorAgent** is activity #1: the
  cold/warm/hot dilemma hunt. The **Scribe**
  (`writeInEnricher`) enriches write-ins before the Condenser.

All agent I/O is Zod-validated at the adapter boundary. A failed Condenser
falls back to `draftPortrait`; a thrown Conjector call ends the hunt with
whatever it banked rather than crashing. The legacy `src/pipeline/antechamber/`
engine (Observer + Investigator + weaver / diviner / compiler) still serves
the loaded / returning-user path and is being retired.

### Seer engine (`src/pipeline/seer/`)

The seer is the live tarot reader. Implementation is a `SeerEngine` class
(peer to `AntechamberEngine`) that hosts two internal layers — **director**
(clinical, slower, cloud runtime) and **actor** (voiced, fast, local
runtime) — and orchestrates four behavior tranches via them: intro,
per-card, chat, outro.

Constructed at antechamber close. Takes `{ profile, antechamberHistory, intention,
drawn, outcomes }`. Constructor synchronously kicks off the intro
pipeline (`directorIntro → actorIntro`) and exposes `ready: Promise<void>`.
UI gates the [ENTER] button on that promise.

The actor is **the Seer**: composed, low-volume, mirror-shaped, no
advise/moralize/verdict. Lowercase. The director prepares the Set the
actor walks onto.

**Tranches:**
- **intro** — serial director → actor (once, at construction)
- **per-card** — serial director → actor, speculatively pre-computed for
  every face-down slot via fan-out
- **chat** — actor-only (director-side chat lives in TODO backlog)
- **outro** — serial director → actor (after 4th flip)

Calls per round R (revealed.length + 1):
- For each still-face-down slot S: `directorPerCard(S, R, history)` →
  `actorPerCard(set, history)` → Monologue cached at `[R, S]`.
- The director thread for slot S sees its OWN card face plus revealed
  history; it does NOT see the faces of other still-face-down slots.
  That constraint is load-bearing — without it, threads cross-leak and
  the round-1 monologues become a single-shot Plan-and-Write in
  disguise.

Total LLM-call budget per reading (full 4-card spread):
- 1 intro actor call (skipped when `preferred_intro` is supplied; the
  READ DEMO path uses a hand-authored intro from `fixtures.ts`).
- 4 + 3 + 2 + 1 = 10 director calls (per-card across 4 rounds).
- 10 actor calls (one per director).
- 1 closing director + 1 closing actor after the 4th flip.
- N chat actor calls (user-initiated; actor-only).

That's ~23 calls/reading. Wasteful by design — the cost of hiding
latency *and* not letting the director cheat by seeing unflipped cards.

Engine state machine (`ReadingPhase`):
```
idle → thinking? → intro → awaiting_flip → flipping → beat_pending? → beat →
  (loop: awaiting_flip → … → beat) →
  closing_thinking → outro → done
```
Chat can be sent from `awaiting_flip` or `done` (`chat_pending` returns
to entry phase).

`awaiting_layer` is `'director' | 'actor' | null` — UI uses it to pick a
latency catchphrase from `stalls.ts`. Director stalls and actor stalls
render in different colors so it's visually obvious which layer the system
is waiting on. The actor runtime is **local** (eventually OSS LLM on the
booth); the director runtime is **cloud** (Anthropic API).

The slot meanings are *mirror-shaped*, not classical:

- **top** — what the user brings *in* to the fork
- **left** — what is unseen about path A
- **right** — what is unseen about path B
- **bottom** — an unaddressed factor sitting under both

These slot meanings are stated in the director prompt and are
load-bearing. Changing them changes the reading.

### Static data

`cards.ts` (78-card Rider-Waite deck with keywords and upright meanings),
`spreads.ts` (FOUR_CARD_DIAMOND is the only one currently used),
`personas.ts` (character data), `astrology.ts` (sun sign, life path,
tarot birth card). Treat these as ground truth; do not duplicate inline.

---

## Module map (purpose, not file inventory)

| Concern | Where |
|---|---|
| App phase machine, routing | `src/App.tsx` |
| Anthropic client + MODELS + tier→model map | `src/pipeline/claude.ts` |
| LLMAdapter interface (provider-agnostic) | `src/pipeline/llm/adapter.ts` |
| Concrete Anthropic adapter (only file that imports SDK) | `src/pipeline/llm/adapter-anthropic.ts` |
| Survey + Tuning engines (Condenser / Conjector / Scribe) | `src/pipeline/introduction-survey/`, `src/pipeline/tuning/` |
| UI rails (the portable driver seam) | `src/pipeline/rails/` |
| AntechamberEngine + agents — LEGACY (loaded-user path, being retired) | `src/pipeline/antechamber/` |
| SeerEngine + agents (director/actor) | `src/pipeline/seer/` |
| Ensemble reading engine — the oracle (behavior/cognition, piles, frame, stall, stages) | `src/pipeline/ensemble/` (see `docs/ENSEMBLE.md`) |
| Oracle baseline (single-voice comparison arm — do not modify) | `src/pipeline/oracle/` |
| Xray lab (ensemble debug surface, docs manager, inspector) | `src/lab/xray/` |
| Booth demo — e2e session in 3d (eyes, table, deck, cards, subtitles) | `src/ui/booth/` |
| Card draw mechanics | `src/pipeline/cards.ts` |
| Spread definitions | `src/pipeline/spreads.ts` |
| three.js scene (turtle + eyes + perspective table/cards + scene stores) | `src/ui/scene/`, `src/ui/scene/TarobotScene.tsx` |
| Card face/back canvas painters (used by the perspective layer) | `src/ui/cards/cardTexture.ts`, `glyphs.ts` |
| Survey + Conjector UI (rails renderers) | `src/ui/survey/`, `src/ui/tuning/` |
| Antechamber UI — LEGACY (loaded-user path) | `src/ui/Antechamber.tsx`, `src/ui/choices/` |
| Reading UI (the Seer screen) | `src/ui/Reading.tsx`, `src/ui/Transcript.tsx` |
| Persistence (API key, sessions) | `src/storage.ts` |
| E2E bot harness (Opus archetype + Haiku answerer) | `scripts/e2e/`, `scripts/e2e-antechamber.ts` |
| Character bibles (free-form) | `persona/` |
| Backlog | `TODO.md` |

This table will rot. When a row is wrong, fix the row rather than rewriting
the doc.

---

## Code conventions

- **TypeScript strict.** No `any` without justification. Optional-chained
  access at trust boundaries (LLM output, storage) — direct access elsewhere.
- **Imports**: app code imports from `src/pipeline/index.ts` and
  `src/pipeline/antechamber/index.ts` / `src/pipeline/reading/index.ts` —
  *not* from deep internal files. The barrel files are the public surface.
- **Zod schemas** at every adapter boundary. The schema *is* the contract;
  prompt-level "respond in JSON" is not trusted.
- **No comments explaining *what*** the code does; identifiers carry that.
  Only comment the *why* when non-obvious — a hidden constraint, a workaround,
  a load-bearing invariant.
- **No backwards-compat hacks.** If something is unused, delete it. Git
  history is the archive. Do not leave `// removed` markers, dead re-exports,
  or commented-out blocks.
- **Lowercase UI copy.** Witchy/quiet register. Button labels render
  uppercase via CSS, source stays lowercase.
- **No emoji** unless the user explicitly asks for one.
- **Phase machines over flags.** State that can be in N modes is a tagged
  union, not a pile of booleans.

### Adding a model call

1. Define the input + output schema in the relevant `schemas.ts`.
2. Write the prompt as a `const` in `prompts/`.
3. Build an `InvocationSpec` in the agent wrapper; route through
   `adapter.invoke(spec, schema)`.
4. Pick the tier — `fast` for tiny ops, `cognition` for default reasoning,
   `deep` only when voice quality is load-bearing.
5. Never call the SDK directly outside `adapter-anthropic.ts`.

---

## Tooling

- `pnpm dev` — Vite dev server on 5173, bound to all interfaces.
- `pnpm build` — `tsc -b && vite build`. Output to `dist/`.
- `pnpm typecheck` / `pnpm lint` — must be clean before commit.
- `pnpm e2e -- --apiKey=$KEY` — runs the bot harness: generates a
  synthetic participant (Opus), runs them through the live antechamber engine
  with a Haiku-driven answerer, writes a timestamped run log to `runs/`.
  Pass `--load <name>` to reuse an existing archetype from `archetypes/`.
- `pnpm smoke:ensemble` — stub-adapter loop check for the ensemble
  engine (no key, no network).
- `pnpm e2e:ensemble` — the ensemble's live headless run (scripted or
  `--auto` model visitor; `--stub` for a no-key dry run). Writes
  full-fidelity `transcript.md` + `session.json` per run — the same
  `SessionRecord` the xray lab's export button produces. See
  `docs/ENSEMBLE.md` §6.
- `pnpm live` — the sit-across-from-it harness (inbox commands: say /
  flip / tick / end); writes session.json + xray.txt per run.
- `pnpm smoke:booth` — headless full-arc drive of the 3d demo's
  presentation state (deal/flip gating, subtitles). No key.
- `pnpm check -- <session.json>` — the 11 mechanical checks
  (SESSION-V2 §9 + FORESIGHT-LEAK).
- `pnpm eval [-- --n=N --arch=X]` — the obfuscated-profile eval:
  generates two-layer dossiers, runs blind sessions with an unaware
  noisy sim, scores against held-back truth (EVAL-METRICS.md).
- `pnpm persona-lab` — same moments, candidate personas, goldilocks
  calls only; the breadth harness for voice work.
- `pnpm xray:render` — regenerate xray.txt transcripts for past runs.
- **Deploy = push to GitHub `main`.** Vercel auto-deploys it. The project is
  owned by the **personal scope `jakekidds-projects`** — NOT the
  `ubitel-projects` work team. (It used to be wrongly linked under Ubitel. If a
  deploy ever lands under Ubitel again, the repo got re-linked to the wrong
  project — re-link to `jakekidds-projects`, do not deploy from Ubitel.) Don't
  run `vercel --prod` by hand; the push IS the deploy. Inspect with
  `vercel ls --scope jakekidds-projects` /
  `vercel project ls --scope jakekidds-projects`. The `tarobot-eosin.vercel.app`
  alias points at production; build runs `git rev-parse --short HEAD` via
  `vite.config.ts` → `__APP_COMMIT__` for the topbar version string.

`archetypes/` and `runs/` are gitignored. So is `.vercel/`.

---

## What's stable, what's churning, what's deferred

### Stable (don't refactor without reason)

- `src/pipeline/claude.ts` — tier→model map, browser client construction.
- `src/pipeline/cards.ts`, `spreads.ts`, `astrology.ts` — static data.
- The `LLMAdapter` interface itself (concrete impl can change; the surface
  shouldn't).
- The `Profile` / `Choice` / `Question` shapes in `src/pipeline/types.ts`
  (consumed across modules).

### Churning

- **Antechamber engine.** Rebuilt as survey→tuning (`introduction-survey/` +
  `tuning/`, see `docs/PIPELINE.md`). Survey + Scribe + Condenser + Conjector
  are wired and playable; the **Compiler arc** (the deepen pool, expert
  pre-calc, the card deal, and the Conjector→Seer bridge) is the next big
  build. The legacy `pipeline/antechamber/` engine still serves the loaded
  path until migrated.
- **Reading engine.** Fan-out architecture just shipped. Per-card director
  + actor threads spawn per round; user picks which face-down card to
  flip. Slot meanings are load-bearing; FLIP_ANIM_MS (950) is a placeholder
  number. The chat plumbing exists but actor-chat voice will iterate after
  real walkthroughs. The READ DEMO menu path skips antechamber and uses a hand-
  authored Marisol fixture — useful for iterating on the reading without
  burning antechamber time.
- **Ensemble reading engine (the go-forward bet).** `src/pipeline/ensemble/`
  + the xray lab and the booth demo, both behind the three-door menu
  (the turtle world is dead code). The
  character is **the oracle** (renamed from "the seer"; the legacy
  `pipeline/seer/` engine keeps its name until retired). Session mode
  is the product (chat-from-zero is a lab probe only). Cast of six:
  driver / persona / interpreter / profiler / conjector / attention
  (see ENSEMBLE.md §4 for the pruning history). Sessions start BLIND —
  the engine draws its own cards, the profiler fills the survey
  in-session, the conjector hunts guesses then writes the dilemma
  document, and the close hands over a quest. Scripted greeting; stage
  goals (P0/P1/P2) feed
  the driver; the persona runs a goldilocks pass (too_safe = the named
  chatbot take / too_far = the stage psychic / spoken — the Hand is
  dead). Speech runs on the SESSION-V2 beat grammar; the persona is
  VESPER (predict-a-human framing, license ladder clarify→guess→
  synthesize fed by the familiarity meter 0-4); intake runs the guess
  cadence (3 questions → mandated guess; cold gates a question; warm
  re-guesses; divergence-checked alt guess) into the focus consent
  gate ("that okay to sit with?") with the mind-heart-root EXPLORATION
  spread as the declined/fallback path; the conjector gets the augur
  feed (all drawn faces at deal time; FORESIGHT-LEAK check guards
  speech). Measured by the obfuscated-profile eval (EVAL-METRICS.md).
  Must beat naive AND the `src/pipeline/oracle/` baseline blind before
  it earns permanence. `docs/ENSEMBLE.md` is the living truth.
- **Card faces.** Currently unicode-glyph + roman-numeral placeholders.
  Real art replaces this later; the contract (each card has a glyph + label)
  stays the same.

### Deferred (stubs only, do not build without explicit go)

- **Async continuous Investigator + lookahead math.** The "no waiting"
  survey UX. Target index = `current_index + ceil(p90_inv / p50_user) + 1`.
  Edits that arrive after the user has passed the target are dropped; the
  Investigator gets feedback and adjusts. See research notes in chat for the
  full sketch.
- **Specific-guess-injection.** Investigator may replace one option in an
  upcoming question with a hypothesized concrete answer. Phase-gated to C/D
  only. Never replace all four options; never edit the same index twice.
  Cold reading's "fishing" mechanized into the UI.
- **Pool expansion.** Authoring work, not architecture. Current pool is
  relational/affect-heavy and blind to geographic, occupational, identity-
  shift, body/somatic, and family-of-origin forks. Documented gap from a
  bot-harness run where a geographic Choice was extracted as relational.
- **Eval rig (the apparatus).** Synthetic-participant generator
  (different model from the director under test) + ground-truth backstory +
  evaluator that scores readings against the hidden backstory along
  inference-quality axes (touched-real-fork, ground-truth-supported,
  ground-truth-contradicted, generic-to-specific calibration). Plus a
  failure-mode catalog — anti-rubrics, not rubrics. Methodology is
  downstream of measurement; without this rig, every change is vibes-based.
- **Local LLM swap.** The `LLMAdapter` interface exists for this. Concrete
  Ollama or llama.cpp adapter is the eventual swap. Not on the near-term
  path.
- **Returning-user disambiguation by birthday.** Today the name-match
  modal triggers on first-name only; a 2+-match shows a picker with sun
  sign + last-seen, but two people with the same name AND same sun sign
  collapse visually. Add birthday-as-secondary-key UI when this comes up.
- **Server-held API key.** Browser-direct is acceptable for the local-only
  MVP where users supply their own key. Festival / public deployment must
  proxy through a server.

### Out of scope (do not propose)

- Multi-user / multi-participant sessions.
- Real-time voice or audio output.
- A backend database. Persistence stays browser-local.
- Optimizing for "fun" as a single rubric. Define failure modes and
  verify the residual with humans instead.

---

## Anti-patterns (avoid these, in priority order)

1. **Building rubrics for "fun" or "eerie."** People have tried for decades
   in comedy and game design. Define failure modes; verify residual with
   humans. Negative engineering, then positive verification.
2. **Iterating actor voice in a vacuum.** Sketch, lock, leave. Real
   voice iteration requires real users in front of it. Burning cycles on
   prompt wordsmithing without playtest data produces nothing that survives
   contact.
3. **One-prompt-and-pray.** Every director call has a fixed schema. If you
   find yourself prompting "do X and also Y and format it nicely," split it.
4. **Director that writes user-facing words.** The director produces
   understanding and intention. The actor produces utterance. If the
   director leaks into delivery, the actor either parrots (off-character)
   or rewrites (wasted work + risk of dropping load-bearing intent).
5. **Optimizing a component before knowing it's the bottleneck.** Always
   re-check where the system is actually failing. The most common waste is
   three weeks tuning actor temperature when an upstream agent was
   producing bad inputs the whole time.
6. **Symptom-driven "fixes" that bypass diagnosis.** When a flow breaks,
   find the root cause. Don't `--no-verify`, don't try/catch around the
   broken thing, don't add a fallback that hides the bug.
7. **Adding error handling for cases that can't happen.** Validate at
   system boundaries (LLM output, storage, user input). Trust internal
   contracts.
8. **Pushing directly to `main` without confirmation** beyond what the user
   has explicitly authorized. Vercel deploys main on push; the blast radius
   includes whoever is currently using the live URL.

---

## How a typical session flows (end to end)

**Current boot posture (2026-08-05): key entry → the three-door menu**
(`src/ui/MainMenu.tsx`): **demo** (the booth — full e2e session in 3d),
**xray lab**, **settings**. The turtle flow below is DEAD CODE — no
route reaches it; git history is the archive.

Two paths behind the menu: a NEW visitor runs the rebuilt survey→tuning
pipeline; a LOADED / returning visitor still runs the legacy
`pipeline/antechamber/` engine (being retired). The new path:

1. User lands. No API key in localStorage → key-entry screen (validated
   against a 1-token Haiku smoke call before saving).
2. Menu → `begin` → `startNewReading` → a fresh `IntroductionSurvey`
   (deterministic, no AI). No Session is persisted on this path yet.
3. Survey: name → 14 facets (one-tap, or type a custom answer) → birthday →
   done. Picks round up into a RawPortrait. No model fires during the survey.
4. Survey close → `enterTuning`:
   - **Scribe** enriches any write-ins into channels (parallel Haiku), joined
     before the next step.
   - **Condenser** paints the Portrait (one Sonnet freeform call) behind a
     "mm, let me look at you a moment" beat. A failed call falls back to
     `draftPortrait` (the raw amalgam laid out) so the hunt still runs.
   - **Conjector** takes the rails: cold/warm/hot guesses → a YES/NO reframe,
     ≤5 moves per thread, re-rooting to new territory, ≤3 dilemmas.
5. Conjector done → `ConjectorResult` dumped to `TuningDone`. The Compiler
   that would consume the dilemmas (and the Conjector→Seer bridge) is UNBUILT,
   so the new path ends here for now.
6. The **reading** (Augur → SeerEngine → card flow: intro → awaiting_flip →
   flipping → beat → loop → outro → done) still runs only on the legacy
   loaded path. Persistence (Person records, resume, returning-user match) is
   also legacy-only; the new survey path does not persist yet.

This flow is mid-migration. When the Compiler arc lands, fix this section.

---

## Notes for the next agent in this seat

- The user has explicitly noted being overwhelmed in the past when work
  became "guess and check." The cure was building the reading so the antechamber
  finally had a downstream artifact to be evaluated against. Preserve that
  closed-loop discipline — do not propose major upstream refactors before
  the downstream consumer can show what signal is actually needed.
- The user dislikes detective theater in their own UX *and* in agent
  collaboration. When in doubt about an approach, propose and let them
  redirect — don't grill them with prerequisite questions.
- The user is fine with autonomous execution and explicit hand-offs but
  expects honest framing of tradeoffs and unknowns. Don't oversell.
- Cut releases (`v0.0.x` git tags) only when the user explicitly asks.
  Version strings in the topbar and `package.json` can move ahead of tags
  to mark work-in-progress, but the tag itself is the bookmark.
- The eventual production "foundation model" the user is building is not
  the AI model — it is the *apparatus* that lets the tarot methodology be
  discovered through selection pressure. The director runs the apparatus;
  deployed Tarobot is the actor. Same shape as director/actor at the
  per-reading level. As above, so below.
