# tarobot

A tarot-themed web app. Dark purple game-feel CRT scene. A turtle (the
mascot) interviews you in the antechamber; then a four-card diamond
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

## How the antechamber works

1. **Openers** — name, then relationship status. Deterministic identity
   gathers with custom UI per format. No AI fires.
2. **Pillars** — 9 always-asked questions, in a fixed order. The
   structural backbone of every reading.
3. **Birthday + PLAY** — after the pillars, the birthday form (feeds the
   astrology) and a PLAY intro beat, then the guessing begins.
4. **The Diviner** — a deep (Opus) call that plays a 20-guess game: it
   guesses what's weighing on you, you answer COLD / WARM / HOT, it homes
   in. LOCATE (1–5) casts wide in batches; COMPOSE (6–20) drills.
5. **WEAVER** — a fast (Haiku) call that curates the candidate dilemmas
   and owns the early-out when you disengage.
6. **Compiler** — at close, sieves the session into one Dilemma the Seer
   reads. **Augur** then predicts 2–4 outcomes branching off the intention.
7. **The Seer** — director + actor. The director (cloud) plans
   silently; the actor (the voiced seer) speaks. Each card is its own
   small fan-out of director+actor calls.

## Authoring questions + prompts (`materials/`)

All text-shaped artifacts — antechamber questions, agent prompts, profile
templates, name banks, mascot lines — live under **[`materials/`](materials/)**
at the repo root. Edit there, push, Vercel rebuilds with the new
content. The directory layout:

```
materials/
  pillars.md                      the pillar questions (9 pillars + pool)
  templates/profile.md            the living-doc profile scaffold
  templates/anchor.md             legacy prose anchor (superseded by the Dilemma)
  prompts/diviner.md              the 20-guess game (LOCATE → COMPOSE)
  prompts/weaver.md               candidate-dilemma curator
  prompts/compiler.md             sieve → DilemmaDocument at close
  prompts/augur-{outline,fill}.md outcome naming + document fills
  prompts/mantra.md               closing one-line takeaway
  prompts/seer/                   seer voice bible + per-call prompts
  names/{masc,fem}.txt            relationship_pick name banks
  mascot/return-lines.md          returning-user mascot lines
```

The top of `materials/pillars.md` documents the schema for questions
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

- `src/App.tsx` — phase machine (key / menu / antechamber / reading / pipeline).
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
