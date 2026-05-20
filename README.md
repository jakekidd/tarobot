# tarobot

A tarot-themed web app. Dark purple game-feel CRT scene. A cat (the
mascot) interviews you through a short survey; then a four-card diamond
spread is read by the Seer. The reading is the thing the rest exists to
serve.

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

## How the survey works

1. **Openers** — name, birthday, intent. Deterministic identity gathers
   with custom UI per format. No AI fires on these.
2. **Pillars** — 6 always-asked questions, in a fixed order, immediately
   after openers. These are the structural backbone of every reading.
3. **Pool** — 14 random draws (deduped against the user's history on
   returning visits) from the broader topic pool.
4. **The Detective** — an Opus call that runs in parallel with each
   pick. It maintains hypotheses about the user, writes a private
   scratchpad it sees again next turn, and EDITS the options of
   upcoming queue items (no question-picking; the queue is pre-rolled
   at survey start).
5. **The Observer** — a Sonnet call that fires every third pick and
   metabolizes the recent answers into profile notes.
6. **Augur** — at survey close, predicts 2–4 outcomes branching off the
   user's stated intention. Pure prose markdown per outcome.
7. **The Seer** — director + actor. The director (cloud) plans
   silently; the actor (the voiced seer) speaks. Each card is its own
   small fan-out of director+actor calls.

## Authoring questions + prompts (`materials/`)

All text-shaped artifacts — survey questions, agent prompts, profile
templates, name banks, mascot lines — live under **[`materials/`](materials/)**
at the repo root. Edit there, push, Vercel rebuilds with the new
content. The directory layout:

```
materials/
  survey.md                       survey questions (Pillars + Pool)
  templates/profile.md            observer's profile scaffold
  templates/story.md              StoryObject shape reference
  prompts/observer.md             observer prompt (profiler)
  prompts/detective.md            detective prompt (story + ladder)
  prompts/augur-{outline,fill}.md outcome naming + document fills
  prompts/mantra.md               closing one-line takeaway
  prompts/seer/                   seer voice bible + per-call prompts
  names/{masc,fem}.txt            relationship_pick name banks
  mascot/return-lines.md          returning-user mascot lines
```

The top of `materials/survey.md` documents the schema for questions
(Pillars / Pool, Probe sub-fields, Options syntax). There is no
separate question-ID column — the engine slugifies the question text
internally.

## Local dev

```
pnpm install
pnpm dev          # vite, http://localhost:5173
pnpm typecheck    # strict mode
pnpm lint
pnpm build
```

## Layout

- `src/App.tsx` — phase machine (key / menu / survey / reading / pipeline).
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
