# tarobot — agent onboarding

This file is the durable orientation for any agent picking up this repo. It
trades implementation detail for principle, because the implementation is
churning faster than docs can keep up. When a section starts to feel brittle,
delete it rather than patch it.

---

## What this is

A tarot-themed web app. The visible product is: a user lands in a dark
purple game-feel CRT scene, a cat (Clat) interviews them via a sequence of
multiple-choice questions, the cat compiles a brief, the Seer then reads
four cards in a diamond spread for them. The reading is the thing the rest
exists to serve.

Deploy is Vercel static. The browser holds the user's Anthropic API key and
calls the model directly — there is no backend, no database, no auth layer.
Persistence is `localStorage` only. The cognition library
(`src/pipeline/`) is structured to run unchanged in Node so the eventual
production system can swap the browser-direct call for a server-held key
without touching pipeline code.

Owner: jakek. Project tone is dark, game-feel, sparse. Pixel / ASCII /
unicode-glyph aesthetic. CRT scanline overlay, three.js Clat as full-screen
backdrop, monospace typography in places. No emoji unless explicitly asked.

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

### Cognition is the director, persona is the performer

Cognition (Sonnet / Opus tier, structured tool calls) is offstage. It holds
the whole arc, models the user on multiple timescales, and produces
*understanding* — not lines. Persona (any tier) is onstage. It receives
the director's notes and improvises the actual utterance in-character.

The split exists because alignment-trained models pull toward
helpful-and-clear, which is the opposite of what the Seer needs.
Asking one model to both reason carefully *and* perform character at once
collapses the reasoning. Keep them separated.

The thematic restatement: the Seer is a medium. Cognition is what she
channels. There really is an intelligence whispering to her that she does
not fully see. Architecturally and narratively, the same shape.

### Cards as constraints

Random card draws are not noise to compensate for. They are the engine that
forces cognition into one narrow angle on this specific person. The
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
2. **Cognition pipeline** (`src/pipeline/`) — Node-portable. Owns engines,
   prompts, schemas, adapter, static data (cards, spreads, personas, the
   dialogue tree). The product.
3. **Persistence + bootstrap** (`src/storage.ts`) — `localStorage` wrapper
   for the API key, sessions, settings. Sits outside `src/pipeline/` so the
   pipeline stays browser-portable.

The pipeline is structured so that every model call routes through an
`LLMAdapter` interface. Concrete impl (`AnthropicAdapter`) is the only thing
that imports `@anthropic-ai/sdk`. Tier names (`fast` / `cognition` / `deep`)
abstract over model IDs — the tier→model mapping lives in one file and is
the only place to change models.

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
(peer to `SurveyEngine`) that hosts two internal agent tiers — cognition
(clinical, slower) and persona (voiced, fast) — and orchestrates four
behavior tranches via them: intro, per-card, chat, outro.

Constructed at survey close. Takes `{ profile, surveyHistory, intention,
drawn, outcomes }`. Constructor synchronously kicks off the intro
pipeline (`cognitionIntro → personaIntro`) and exposes `ready: Promise<void>`.
UI gates the [ENTER] button on that promise.

Persona is **the Seer**: composed, low-volume, mirror-shaped, no
advise/moralize/verdict. Lowercase. Cognition is the director who
prepares the Set the persona walks onto.

**Tranches:**
- **intro** — serial cognition → persona (once, at construction)
- **per-card** — serial cognition → persona, speculatively pre-computed for
  every face-down slot via fan-out
- **chat** — persona-only (cognition lives in TODO backlog)
- **outro** — serial cognition → persona (after 4th flip)

Calls per round R (revealed.length + 1):
- For each still-face-down slot S: `cognitionPerCard(S, R, history)` →
  `personaPerCard(clinical, history)` → Monologue cached at `[R, S]`.
- The cognition thread for slot S sees its OWN card face plus revealed
  history; it does NOT see the faces of other still-face-down slots.
  That constraint is load-bearing — without it, threads cross-leak and
  the round-1 monologues become a single-shot Plan-and-Write in
  disguise.

Total LLM-call budget per reading (full 4-card spread):
- 1 intro persona call (skipped when `preferred_intro` is supplied; the
  READ DEMO path uses a hand-authored intro from `fixtures.ts`).
- 4 + 3 + 2 + 1 = 10 cognition calls (per-card across 4 rounds).
- 10 persona calls (one per cognition).
- 1 closing cognition + 1 closing persona after the 4th flip.
- N chat persona calls (user-initiated; persona-only).

That's ~23 calls/reading. Wasteful by design — the cost of hiding
latency *and* not letting cognition cheat by seeing unflipped cards.

Engine state machine (`ReadingPhase`):
```
idle → thinking? → intro → awaiting_flip → flipping → beat_pending? → beat →
  (loop: awaiting_flip → … → beat) →
  closing_thinking → outro → done
```
Chat can be sent from `awaiting_flip` or `done` (`chat_pending` returns
to entry phase).

`awaiting_tier` is `'cognition' | 'persona' | null` — UI uses it to pick a
latency catchphrase from `stalls.ts`. Cognition stalls and persona stalls
render in different colors so it's visually obvious which tier the system
is waiting on. (Persona is the tier eventually swappable to local OSS
LLMs; cognition stays cloud.)

The slot meanings are *mirror-shaped*, not classical:

- **top** — what the user brings *in* to the fork
- **left** — what is unseen about path A
- **right** — what is unseen about path B
- **bottom** — an unaddressed factor sitting under both

These slot meanings are stated in the cognition prompt and are
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
| SeerEngine + agents (cognition/persona) | `src/pipeline/seer/` |
| Card draw mechanics | `src/pipeline/cards.ts` |
| Spread definitions | `src/pipeline/spreads.ts` |
| three.js scene (Clat + eyes + perspective table/cards + scene stores) | `src/ui/scene/`, `src/ui/scene/TarobotScene.tsx` |
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
- **Reading engine.** Fan-out architecture just shipped. Per-card cognition
  + persona threads spawn per round; user picks which face-down card to
  flip. Slot meanings are load-bearing; FLIP_ANIM_MS (950) is a placeholder
  number. The chat plumbing exists but persona-chat voice will iterate after
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
  (different model from cognition under test) + ground-truth backstory +
  evaluator that scores readings against the hidden backstory along
  inference-quality axes (touched-real-fork, ground-truth-supported,
  ground-truth-contradicted, generic-to-specific calibration). Plus a
  failure-mode catalog — anti-rubrics, not rubrics. Methodology is
  downstream of measurement; without this rig, every change is vibes-based.
- **Local LLM swap.** The `LLMAdapter` interface exists for this. Concrete
  Ollama or llama.cpp adapter is the eventual swap. Not on the near-term
  path.
- **Returning-user UI.** Data layer done (`findReturningUser`,
  `seedFromReturning`); missing the "is this you?" modal.
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
2. **Iterating persona voice in a vacuum.** Sketch, lock, leave. Real
   voice iteration requires real users in front of it. Burning cycles on
   prompt wordsmithing without playtest data produces nothing that survives
   contact.
3. **One-prompt-and-pray.** Every cognition call has a fixed schema. If you
   find yourself prompting "do X and also Y and format it nicely," split it.
4. **Cognition that writes user-facing words.** Cognition produces
   understanding and intention. Persona produces utterance. If cognition
   leaks into delivery, persona either parrots (off-character) or rewrites
   (wasted work + risk of dropping load-bearing intent).
5. **Optimizing a component before knowing it's the bottleneck.** Always
   re-check where the system is actually failing. The most common waste is
   three weeks tuning persona temperature when the Compiler was producing
   bad TargetChoices the whole time.
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
2. Menu → `begin` → new `Session` written to localStorage → survey starts.
3. Survey: openers deterministic (name, birthday, birth time, has-question);
   from Q5 the engine fires Observer + Investigator per pick. Heat updates
   from behavioral signals; phase derives from heat (monotonic). Close
   predicates fire on saturation / fatigue / cap.
4. On close, Compiler runs (Sonnet) and returns `CompilerOutput` = profile +
   openers + prose brief. (Openers are produced but currently unread by the
   reading flow — vestige from the dormant tent path.)
5. App routes survey-complete directly into the reading phase. Reading
   mounts, draws four cards via `drawForSpread(FOUR_CARD_DIAMOND)`, sets
   reader-mode to `'eyes'`, publishes the drawn cards into `cardSceneStore`
   so the perspective layer renders the table + face-down cards, then
   spawns intro (or uses `preferred_intro`) and round-1 fan-out.
6. Phase machine sequences the reveal: intro → awaiting_flip (user clicks a
   face-down card) → flipping (CSS-3D anim, 950ms) → beat (typed, user-tap)
   → next awaiting_flip → … → closing_thinking → outro (typed, user-tap) →
   done. Chat is enabled in awaiting_flip and done; persona replies are
   their own LLM call.
7. User can exit at any point via the topbar `exit` button. No persistence
   for in-progress readings; cards re-draw fresh on resume.

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
  discovered through selection pressure. Cognition runs the apparatus;
  deployed Tarobot is the persona. Same shape as cognition/persona at the
  per-reading level. As above, so below.
