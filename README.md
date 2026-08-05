# tarobot

A tarot-themed web app. The reading is the thing the rest exists to
serve; the reader character is **the oracle**.

**Current focus:** the app boots to a three-door menu — **demo** (the
booth: the full session in 3d — eyes, red table, deal-by-tapping deck,
subtitles), **xray lab** (the debug surface), **settings**. Both demo
and lab drive the same ensemble reading engine (`src/pipeline/ensemble/`, see
[`docs/ENSEMBLE.md`](docs/ENSEMBLE.md)) — blind four-card sessions,
scripted greeting, driver/persona behavior track, profiler + conjector
cognition (the dilemma named mid-session, a quest at the close). The
older turtle world (dark purple CRT scene, antechamber interview,
four-card diamond read) is parked behind the lab's ← menu button while
the ensemble earns its keep.

Tarot is about healing — about unraveling the stories we inevitably
get stuck telling ourselves, to uncover new meaning, perspective,
growth, and peace. Tarobot is built around that frame. The reading
illuminates the user's relationship to a fork they are standing at; it
doesn't predict. The win condition is the user feeling *seen*, not the
system appearing prescient.

---

## How it's built

- **React 19 + Vite 7 + TypeScript strict** on the frontend.
- **three.js** for the full-screen scene (mascot, star ring, card flips,
  orbiting answer-cards).
- **Anthropic SDK** in the browser. The user supplies their own API key;
  there is no backend, no database, no auth layer. Persistence is
  `localStorage` only.
- **Vercel** for hosting. Push to `main` → live within ~30s.

## How the antechamber works

The antechamber was rebuilt as a clean pipeline — **survey → scribe →
condenser → conjector** — over a portable UI-rails seam. (The older
pillars / weaver / diviner engine in `src/pipeline/antechamber/` is legacy,
still serving returning users, being retired.)

1. **Survey** — a deterministic, no-AI walk through 14 facet questions
   (name → facets → birthday). Each pick staples pre-authored content into
   a RawPortrait. `materials/survey.json` holds the questions + per-option
   channels.
2. **Scribe** (Haiku) — enriches any write-in answers into the same
   channels a listed option carries, in parallel, before the Condenser.
3. **Condenser** (Sonnet) — synthesizes the RawPortrait into a markdown
   *Portrait*: confidence-tagged central leads, patterns, tensions, cast,
   posture. The read the Conjector hunts off.
4. **Conjector** (Sonnet) — the cold/warm/hot dilemma hunt. It guesses
   what's alive in you; you answer COLD / WARM / HOT; it commits a
   *reframe* (the question under your question) you confirm YES / NO.
   Budget-paced; finds up to 3 dilemmas, re-rooting to fresh territory via
   a negative-space stack.
5. **Compiler** *(not built yet)* — will deepen each dilemma (expert
   agents, the card deal) and bridge to the reading.
6. **The reading** — legacy path: director + actor (`src/pipeline/seer/`).
   The go-forward reading engine is the ensemble (`docs/ENSEMBLE.md`).

Full living detail: **[`docs/PIPELINE.md`](docs/PIPELINE.md)**. Onboarding +
current state: **[`docs/HANDOFF.md`](docs/HANDOFF.md)**.

## Authoring questions + prompts (`materials/`)

All text-shaped artifacts — antechamber questions, agent prompts, profile
templates, name banks, mascot lines — live under **[`materials/`](materials/)**
at the repo root. Edit there, push, Vercel rebuilds with the new
content. The directory layout:

```
materials/
  survey.json                     the 14-facet survey (questions + per-option channels)
  prompts/condenser.md            RawPortrait → markdown Portrait
  prompts/scribe.md               enrich a write-in into channels
  prompts/conjector/              the dilemma hunt (move / reroot / summary)
  prompts/ensemble/               one system prompt per ensemble agent
  prompts/seer/                   legacy seer voice bible + per-call prompts
  ensemble/beats.json             the beat library (authored lines + typed-slot skeletons)
  prompts/augur-{outline,fill}.md outcome naming + document fills (reading)
  names/{masc,fem}.txt            relationship_pick name banks
  mascot/return-lines.md          returning-user mascot lines
  # legacy (antechamber engine, retiring): pillars.md, templates/,
  # prompts/{diviner,weaver,compiler,intention-suggestor,mantra}.md
```

The `authoring` block at the top of `materials/survey.json` documents the
per-option channel schema (indicators / implications / identities / shadow /
weight) and the authoring discipline.

## Local dev

```
pnpm install
pnpm dev          # vite, http://localhost:5173
pnpm typecheck    # strict mode
pnpm lint
pnpm build
```

## Layout

- `src/App.tsx` — phase machine (key / menu / survey / tuning / reading / pipeline; legacy antechamber for returning users).
- `src/pipeline/` — Node-portable cognition. Engines, schemas, static
  data (cards, spreads, personas). The product. Text-shaped content
  (prompts, templates, name banks) lives in `materials/` and is
  imported via Vite `?raw`.
- `materials/` — single source of truth for all editable text.
- `src/ui/` — React layer.
- `src/storage.ts` — `localStorage` wrapper for the API key, Persons,
  the active in-flight session.

## Architecture notes for agents

Deep architectural detail (load-bearing principles, agent split,
runtime categories, deferred-stubs list) lives in **CLAUDE.md** at the
repo root. Read that first before contributing — it covers the why
behind decisions the README doesn't have room for.
