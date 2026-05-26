# tarobot — agent onboarding

This file is the durable orientation for any agent picking up this repo. It
trades implementation detail for principle, because the implementation is
churning faster than docs can keep up. When a section starts to feel brittle,
delete it rather than patch it.

**For the current pipeline shape, read `docs/PIPELINE.md` FIRST.** That doc
is the living source of truth for which agents fire in which phase, what
they read, what they emit, and the load-bearing principles. The
REFACTOR-V3.md doc is older planning context and lags behind reality.

---

## What this is

A tarot-themed web app. The visible product is: a user lands in a dark
purple game-feel CRT scene, a cat (the survey mascot) interviews them via
a sequence of multiple-choice questions, then the Seer reads four cards
in a diamond spread for them. The reading is the thing the rest exists
to serve.

Deploy is Vercel static. The browser holds the user's Anthropic API key and
calls the model directly — there is no backend, no database, no auth layer.
Persistence is `localStorage` only. The pipeline library
(`src/pipeline/`) is structured to run unchanged in Node so the eventual
production system can swap the browser-direct call for a server-held key
without touching pipeline code.

In prod, this app runs on an on-prem booth computer at a music festival
(Burning Man). The booth serves the survey page over its local hotspot/LAN
to phones in line. The reading happens at the booth itself with a real-
robot Seer. Latency budget shapes the runtime split below.

Owner: jakek. Project tone is dark, game-feel, sparse. Pixel / ASCII /
unicode-glyph aesthetic. CRT scanline overlay, three.js cat mascot as
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
  survey.md                       the survey questions (Pillars + Pool)
  templates/
    profile.md                    observer scaffold (9 sections + HTML-comment instructions)
    story.md                      StoryObject shape reference doc (human-only)
  prompts/
    observer.md                   profiler prompt — every turn, full body rewrite, speculation authority
    detective.md                  story-architect + ladder-collaborator
    augur-outline.md              outcome naming (binary/ternary/open)
    augur-fill.md                 outcome document fills (markdown prose)
    mantra.md                     closing one-line takeaway
    seer/
      voice-bible.md              shared craft for all actors
      director-intro.md           prose-brief from story
      director-per-card.md        per-card Set (given circumstances)
      director-closing.md         ClosingIntent + held-probe swing
      actor-intro.md              one-line voiced intro
      actor-per-card.md           voiced beat from a Set
      actor-closing.md            voiced outro
      actor-chat.md               between-beats reply
  names/
    masc.txt                      relationship_pick name bank (one per line)
    fem.txt
  mascot/
    return-lines.md               canned mascot lines for returning RESUME
```

## Survey engine — the three artifacts

At survey close, three artifacts hand off to the Seer:

- **profile** (observer's domain · breadth) — a freeform markdown
  document the observer rewrites every turn. 9 section headers
  (`self / history / relationships / joys / fears / insecurities /
  yearnings / now / tensions`). Plus side-channel reads (signals,
  patterns, contradictions, avoidances), hooks (verbatim specifics
  the seer can echo), edges (growth surface — what the user almost-
  knows), and cast (named people + per-person observer notes).
- **investigation** (detective's domain · depth) — a hypothesis ladder
  (confirmed / probable / tentative / contested / refuted / held)
  populated by:
  - the algorithmic seeder (`src/pipeline/survey/seeder.ts`),
    which reads each question's `Inversions:` probe text and seeds
    deterministic hypotheses into `tentative[]`,
  - the observer (every turn — elevates / holds / refutes seeds),
  - the detective (adds new hypotheses, moves rungs).
- **story** (detective's domain · narrative) — the slice across time
  anchored to the user's fork. Five slots:
  - `fork: { a, b, is_stasis }` — the two future paths. `is_stasis`
    true means the detective constructed it from a stasis pattern
    (the user has no live decision; the fork is "act on this vs.
    continue as you are").
  - `present_pressure` — what makes the fork acute right now.
  - `past_root` — what in their history pre-figures the fork.
  - `stakes: { on_a, on_b }` — what is at risk each way.
  - `hooks` — verbatim concrete specifics.

The cards land on story slots (past_root → past card, present_pressure
→ present, fork.a + fork.b → the two future cards). The director's
prose_brief is built around story; the closing director receives the
held-probe queue (sorted by age DESC) and may take ONE risky swing.

## The mascot (the turtle) is the user-facing voice during survey

Three agents fire per post-opener pick (returning users skip the
observer + detective):

- **mascot commentary** (local, real-time, in-character) — what the
  user sees and hears between picks. Reactive lines, RPG-dialogue
  style. The user-facing layer.
- **observer** (cognition tier, cloud, async) — psychological profiler.
  Rewrites profile.body, elevates / refutes hypotheses. SILENT — never
  surfaces mid-survey.
- **detective** (deep tier, cloud, async) — story architect + ladder
  collaborator. Builds the StoryObject, surfaces new hypotheses.
  SILENT — never surfaces mid-survey.

Observer + detective outputs never leak to the user. Only the mascot's
reactive commentary does. If a future implementation accidentally
prints detective thoughts to the user, that's a regression of this
load-bearing rule.

## Categories — the 9 the observer files under

```
self           personality · how they come across · belief stance
history        formative experiences · old wounds · regrets
relationships  cast dynamics · whose voice they carry
joys           aliveness · what they nerd out about · pride / built
fears          anticipated harms · anxieties
insecurities   self-doubt · comparison · what they hide
yearnings      unfulfilled wants · the version they want to become
now            current situation · the live fork · what's pulsing
tensions       internal contradictions · belief-personality mismatches
               (observer-derived only, never tagged on a question)
```

Of the 9, 7 are question-tagged in `materials/survey.md`. `tensions`
is observer-derived only — emerges across answers. `pride` collapsed
into `joys` (people perform humility on direct asks; observer infers
from indirect signal).

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

### No detective theater (survey/interview rule)

The survey must not weaponize silence, corner the user, or punish low effort.
A user who picks vague options or passes should not feel cross-examined.
The historical failure mode this guards against: a smug investigator agent
that ramps difficulty in response to non-engagement, killing the session.
The investigator's job is to deduce *while keeping the room warm*.

### Local vs cloud (runtime category)

Every agent is designated **local** or **cloud**. The category is about
*where the call goes in prod* — not about model size, which is a separate
concern (`fast` / `cognition-tier` / `deep` in `src/pipeline/claude.ts`).

- **local** runs on the booth's on-prem LLM (an OSS model on a local box).
  Used for everything in the critical-latency path: survey-time agents
  (observer, detective, interrogator) that fire every turn, and the
  seer's actor (which the user hears voiced in real-time). Today these
  are all satisfied by Claude as scaffolding — the local-LLM swap is the
  eventual replacement, and the `LLMAdapter` interface is the seam.

- **cloud** stays on the Anthropic API. Used where latency is tolerable
  because the call is one-shot (shaman, augur) or parallel-with-voice
  (the seer's director runs while the actor is already speaking the
  previous beat). Reasoning quality matters more than wall-clock here.

This split is load-bearing for the festival deployment: cloud calls cost
network round-trip + provider variance, which is fatal on the per-turn
survey loop. The pipeline page (`src/ui/Pipeline.tsx`) makes the
designation visible per agent.

### Mirror through the seams

Both halves of the experience already wear this shape — survey reconstructs
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

### Survey engine (`src/pipeline/survey/`)

Two-agent design. Observer + Investigator fire per answered question after
the openers; Compiler runs once at survey close.

- Engine is a plain TypeScript class with a subscriber API. UI subscribes;
  the e2e bot subscribes; the engine itself is framework-agnostic.
- Tree (`tree.json`) is a flat pool of nodes with optional answer-pointer
  followups. Each node declares category, format, options, phase eligibility,
  interpretation hints. Loader validates structure at boot.
- Heat is *deterministic* (not LLM-controlled). Phase is derived from heat
  with a monotonic guard. Close criteria are predicate-OR'd (saturation /
  fatigue / cap).
- All agent I/O is Zod-validated at the adapter boundary. Malformed output
  retries once, then falls back deterministically rather than crashing the
  engine.

### Seer engine (`src/pipeline/seer/`)

The seer is the live tarot reader. Implementation is a `SeerEngine` class
(peer to `SurveyEngine`) that hosts two internal layers — **director**
(clinical, slower, cloud runtime) and **actor** (voiced, fast, local
runtime) — and orchestrates four behavior tranches via them: intro,
per-card, chat, outro.

Constructed at survey close. Takes `{ profile, surveyHistory, intention,
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
| SurveyEngine + agents (observer/detective/interrogator/shaman/augur) | `src/pipeline/survey/` |
| SeerEngine + agents (director/actor) | `src/pipeline/seer/` |
| Card draw mechanics | `src/pipeline/cards.ts` |
| Spread definitions | `src/pipeline/spreads.ts` |
| three.js scene (turtle + eyes + perspective table/cards + scene stores) | `src/ui/scene/`, `src/ui/scene/TarobotScene.tsx` |
| Card face/back canvas painters (used by the perspective layer) | `src/ui/cards/cardTexture.ts`, `glyphs.ts` |
| Survey UI (questions, choices) | `src/ui/Survey.tsx`, `src/ui/choices/` |
| Reading UI (the Seer screen) | `src/ui/Reading.tsx`, `src/ui/Transcript.tsx` |
| Persistence (API key, sessions) | `src/storage.ts` |
| E2E bot harness (Opus archetype + Haiku answerer) | `scripts/e2e/`, `scripts/e2e-survey.ts` |
| Character bibles (free-form) | `persona/` |
| Backlog | `TODO.md` |

This table will rot. When a row is wrong, fix the row rather than rewriting
the doc.

---

## Code conventions

- **TypeScript strict.** No `any` without justification. Optional-chained
  access at trust boundaries (LLM output, storage) — direct access elsewhere.
- **Imports**: app code imports from `src/pipeline/index.ts` and
  `src/pipeline/survey/index.ts` / `src/pipeline/reading/index.ts` —
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
  synthetic participant (Opus), runs them through the live survey engine
  with a Haiku-driven answerer, writes a timestamped run log to `runs/`.
  Pass `--load <name>` to reuse an existing archetype from `archetypes/`.
- Vercel auto-deploys `main` pushes. The `tarobot-sage.vercel.app` alias
  always points at production. Build time runs `git rev-parse --short HEAD`
  via `vite.config.ts` and exposes `__APP_COMMIT__` for the topbar version
  string.

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

- **Survey engine.** Today: synchronous, two-agent (Observer+Investigator),
  heat-driven phase. Research synthesis points toward async continuous
  Investigator + trigger-fired Observer + specific-guess-injection +
  flat-pool / runtime-tree. Refactor is gated on actually walking through
  the reading first, but expect this subsystem to change significantly.
- **Reading engine.** Fan-out architecture just shipped. Per-card director
  + actor threads spawn per round; user picks which face-down card to
  flip. Slot meanings are load-bearing; FLIP_ANIM_MS (950) is a placeholder
  number. The chat plumbing exists but actor-chat voice will iterate after
  real walkthroughs. The READ DEMO menu path skips survey and uses a hand-
  authored Marisol fixture — useful for iterating on the reading without
  burning survey time.
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

1. User lands. If no API key in localStorage, key-entry screen. Key
   validated against a tiny smoke call (Haiku, 1 token) before saving.
2. Menu → `begin` → fresh `Session` in memory (NOT persisted yet). Survey starts.
3. Q1 (name): on submit, `findPeopleMatchingName` runs.
   - 0 matches → continue normally.
   - 1+ match → `ReturningUserModal` overlays. User picks **RESUME** →
     `engine.confirmReturningPerson(match)` folds the Person's profile +
     history into engine state, skips remaining openers whose data is
     already known, seeds the (deduped) starter pool, and the mascot
     delivers one of `RETURN_LINES`. Or **START FRESH** →
     `deletePerson(match.id)` and the survey proceeds as for a new user.
4. Q2 (birthday), Q3 (has_question) run.
5. **Save threshold:** once all 3 openers are answered, a Person record
   is created (new user) or updated (returning), and the active session
   gets persisted to `tarobot:active_session`. Before this, bailing
   leaves no localStorage trace.
6. Survey body: engine fires Observer → Detective → Interrogator per
   pick. Starter pool (6 seeds) and Interrogator basket both filter out
   `prior_answered_node_ids` (hard dedupe across the visitor's history).
7. Cap (20 post-opener questions): Interrogator suppressed past
   `cap − STARTER_SEED_COUNT` so the existing queue rides out the last
   stretch. On the 20th answer, `beginShamanStage()` fires.
8. Shaman runs (cloud) with `prior_intentions` in its input — it's
   instructed not to duplicate prior intentions, optionally proposing
   one "deepening" of the most recent prior. Returns 4 suggestions.
9. User picks/writes intention. UI shows `last time you asked: ...` as
   a soft hint when prior_intentions is non-empty. `submitIntention()`
   triggers Augur (cloud, 2-stage) → SeerEngine constructed →
   `seer.ready` resolves → state stage = 'reading_ready'.
10. ENTER → `onComplete(seer)`. Survey effect appends the completed
    visit to the Person record (intention + answered_node_ids +
    completed_at) and clears active session.
11. App routes to Reading screen with the prebuilt Seer. Card flow:
    intro → awaiting_flip → flipping (950ms) → beat → loop →
    closing_thinking → outro → done. Chat allowed in awaiting_flip /
    done; actor replies are their own LLM call.
12. Exit anytime via topbar. If past save threshold, the in-progress
    Person record persists; resuming returns to the same survey state.

This flow will change. When it does, fix this section.

---

## Notes for the next agent in this seat

- The user has explicitly noted being overwhelmed in the past when work
  became "guess and check." The cure was building the reading so the survey
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
