# Survey engine — handoff

You are an agent picking up the tarobot survey engine. This doc is the bridge between the high-level orientation in `CLAUDE.md` and the working code. Read `CLAUDE.md` first for project tone and the load-bearing principles; this doc covers **state, gaps, and what to do next** as of commit `cd02442`.

---

## 30-second orientation

Three artifacts hand off to the Seer at survey close:
- **`profile`** — observer's domain. A SurveyProfile in engine state, an assembled `Profile` for the Seer. Carries `body` (markdown doc), `hooks` (verbatim phrases), `edges` (growth surface), `side_channel` (telemetry signals), `cast` (named people).
- **`investigation`** — detective's domain. `hypotheses` (6-rung ladder: confirmed/probable/tentative/contested/refuted/held) + `story` (StoryObject: fork/present_pressure/past_root/stakes/hooks).
- **`heldProbes`** — `investigation.hypotheses.held` sorted by age DESC, surfaced as risky probes for the Seer's closing director and the Augur.

The Augur runs at survey close (cognition+deep tier, cloud) to write the 2-4 outcome documents the Seer reads silently. The Seer then runs intro/per-card/closing/chat pipelines (director→actor) for the live reading.

**Critical understanding:** the survey engine is the *producer*; the Seer is the *consumer*. They communicate via what's in `EngineState` at survey close + what's passed to `new Seer({ ... })`. Anything written to engine state that the Seer doesn't read about is dead.

---

## What's working

| Subsystem | State | Notes |
|---|---|---|
| Engine state machine (`engine.ts`) | ✅ | Phase machine, undo snapshot, pickEpoch invalidation for in-flight pipelines, returning-user lite mode |
| Algorithmic seeder (`seeder.ts`) | ✅ | Deterministic. Reads `Inversions:` probe text from `materials/survey.md` and drops `tentative[]` hypotheses on every post-opener pick. Ages existing tentative + held by 1 turn each pick |
| Detective | ✅ | Produces `StoryObject` reliably. Story slots in last transcript were excellent (fork + past_root + present_pressure + stakes + hooks all populated and load-bearing) |
| Hypothesis ladder | ✅ | Routes correctly; observer + detective both contribute moves |
| Algorithmic hooks + side_channel | ✅ NEW in `cd02442` | `algoExtract.ts` runs at survey close, overwrites `profile.hooks` + `profile.side_channel` with deterministic extracts from `picks_log` + `timing_log` |
| End-of-survey synthesis pass | ✅ NEW in `cd02442` | One final observer call in `runFinalObserverPass()` with full Q&A history, explicit "revise Q1-5 and populate `## tensions`" framing |
| Body-shape guard | ✅ NEW in `cd02442` | Now merges section-by-section instead of all-or-nothing reject. Per-turn observer can drop a section without wiping it from the doc |
| heldProbes → Augur | ✅ NEW in `cd02442` | Augur outline + fill both receive the held probes; outline prompt knows to write a probe-outcome |
| Augur | ✅ | 2-stage: outline (cognition, JSON tool, names 2-4 outcomes) then fill ×N (deep, freeform markdown, ~2000 tokens each) |
| Seer construction handoff | ✅ | `SeerOpts` takes `profile`, `story`, `heldProbes`, `investigation`, etc. Seer's intro pipeline kicks off in constructor; UI gates on `seer.ready` |
| 250ms choice lockout | ✅ | Fixes the double-submit-on-rush bug. `useChoiceReady` hook gates the three choice components |
| Active session persistence | ✅ | Saves at threshold (all 3 openers answered), updates on each state change, clears on survey complete OR mid-survey exit via topbar |
| Unit test suite | ✅ | 141 tests passing — `pnpm test`. No inference; FakeAdapter pattern. Covers parser, seeder, apply paths, mantra sanitizer, name banks, return lines, template loader, engine state machine, full-flow smoke, algo extract |

---

## The critical gap (CLOSED, was the headline issue)

Previously: Observer wrote `profile.body / hooks / edges / side_channel` to engine state but `assembleProfile()` dropped all of it — none of the Observer's psychological texture ever reached the Seer's director. **Fixed as of the same commit cycle as this doc.**

- `Profile` type extended with `observer_body / observer_hooks / observer_edges / observer_side_channel` (optional fields).
- `assembleProfile` forwards them from `state.profile`.
- All three director payload builders (intro / per-card / closing) include them.
- All three director prompts (`materials/prompts/seer/director-{intro,per-card,closing}.md`) now describe the new fields, with closing director told that `observer_edges` is the closing-mantra material.

Verify after a real survey: dump `state.profile.body` and check it shows up in the per-card / intro director payloads.

---

## What I just shipped in `cd02442`

1. **Sectional body-merge guard** (`engine.ts` ~L995–L1045). The old guard rejected the whole rewrite if any of the 9 required `## headers` were missing. New behavior: split both prior and new body into sections, merge per-section, keep prior content for sections the new body dropped. Always emits all 9 headers in canonical order. The first observer that ever wrote nothing now gets a chance to incrementally fill the document.

2. **End-of-survey synthesis pass** (`runFinalObserverPass()` in `engine.ts`, `runFinalObserver` in `agents/observer.ts`, `'observer-final'` stage in `agents/payload.ts`). One Observer call after the last pick, before Augur. Same agent + schema, different framing in the user payload: full Q&A history visible, explicit instruction to re-evaluate Q1-5 and populate `## tensions`. Fires inside `submitIntention()`. Skipped for returning users (lite mode).

3. **Algorithmic extraction** (`algoExtract.ts`). `extractHooks(picks)` pulls verbatim phrases from `picks_log` (skipping openers, JSON payloads, long answers, "pass" sentinels). `extractSideChannel(timing, picks)` computes signals from `timing_log` — fast picks (pre-loaded answers), slow picks (deliberation), empty intent (diagnostic non-answer), initial≠final deltas (social filter). Both overwrite `profile.hooks` and `profile.side_channel` after the synthesis pass. Replaces the LLM's unreliable per-turn emission.

4. **heldProbes to Augur** (`agents/augur.ts`, `materials/prompts/augur-outline.md`). Augur's `AugurInput` now accepts `heldProbes?: Hypothesis[]`. Outline and fill both receive them; the outline prompt has new HELD PROBES section explaining the probe-outcome strategy.

The submitIntention flow is now:
```
1. runFinalObserverPass()       ← one cognition-tier call (~5s)
2. applyAlgoExtraction()        ← deterministic, no LLM
3. assembleProfile()            ← snapshot for Augur + Seer
4. runAugur({ ..., heldProbes })← outline + fill ×N (~5-7s)
5. new Seer({ ... })            ← intro pipeline kicks off (~3s)
6. await seer.ready             ← then stage → reading_ready
```

---

## Open work, ranked

1. **Wire Observer output to Seer** (above; the critical gap). Highest leverage. Without this, half the agent ensemble is computing things nobody reads.

2. **Question pool gaps from real-survey critique.** Last transcript showed redundancy (4 questions probing the "hidden self" axis, 3 probing avoidance) and missing dimensions (no `joys` question, nothing about what the user does or builds). Likely fixes: trim 2-3 redundant pool entries from `materials/survey.md`, add 1-2 `joys` questions, add 1 occupation/craft question. **Update existing pillar tags** as needed to match the 9-category set.

3. **Per-card slot-aware Augur.** The story has slots (`past_root` / `present_pressure` / `fork.a` / `fork.b`) and the spread has card positions (top / bottom / left / right). The Augur could write outcomes tagged for specific slots, so the per-card director knows which outcome's tone to lift for a given card. Today outcomes are slot-unaware. Spans `agents/augur.ts`, `materials/prompts/augur-{outline,fill}.md`, and the seer's per-card director.

4. **ForkChoice could collect multiple dichotomies, not one.** The 9-fork pillar today fires `onPick` the moment any row is tapped. The 21-second deliberation we saw in the last transcript suggests the user wanted to pick more than one. Consider letting the user mark 2-3 most-loaded rows before confirming. Lives in `src/ui/choices/ForkChoice.tsx`. Engine encoding needs to accept multi-fork answer (currently single string `"continue"` or `"between:continue/change"`).

5. **Augur outline simplification.** When `story.fork` is non-null AND `is_stasis: false`, the outline stage is doing ~85% obvious work (binary outcomes named after the two paths). Could be replaced with a deterministic stub. **Needs measurement first** — check whether the LLM is adding texture beyond what's mechanical. Don't pre-optimize.

6. **GitHub Actions for tests on PRs.** Task #121, still open. `.github/workflows/test.yml` should run `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test` on PRs to main.

7. **v0.0.2 cut + walkthrough.** Task #122, still open. Real-user walkthrough, fix any surprises, tag `v0.0.2`, bump display version in `package.json` and `App.tsx` topbar to v0.0.3.

---

## Where to read first

Mental model — read in order:
1. `CLAUDE.md` — project orientation. Especially the "Load-bearing principles" and "Three artifacts" sections.
2. `materials/survey.md` — every question in the pool. The pillar/pool split, the structured `Surface / Inversions / Watch for` probes per question. **This is the most-edited authoring surface.**
3. `materials/templates/profile.md` — the 9-section profile scaffold the observer fills. The HTML-comment instructions are visible to the observer at runtime.
4. `materials/prompts/observer.md` and `materials/prompts/detective.md` — the two main cognition prompts.
5. `src/pipeline/survey/types.ts` — the type universe. `EngineState`, `SurveyProfile`, `Investigation`, `StoryObject`, `Hypothesis`, `HypothesisLadder`, `SideChannel`.
6. `src/pipeline/survey/engine.ts` — the engine class. Long but well-commented. Start at `submitAnswer()` (~L168) and `submitIntention()` (~L345).
7. `src/pipeline/survey/agents/payload.ts` — what each agent actually receives.
8. `src/pipeline/survey/profile-assembly.ts` — where SurveyProfile becomes the Profile the Seer reads. **This is where the observer→seer gap lives.**

Skim:
9. `src/pipeline/seer/agents/director.ts` — the 3 director functions (intro, per-card, closing). Each builds a payload from `input.profile.*` and calls the LLM with the matching prompt from `materials/prompts/seer/director-*.md`.
10. `src/ui/Survey.tsx` — UI side. Phase routing, intent confirm, undo button. Mostly thin.

---

## How to verify your work

```bash
pnpm typecheck && pnpm lint && pnpm test    # all must pass before commit
pnpm dev                                    # local at 5173
pnpm build                                  # production smoke
```

Visual walkthrough (the only way to verify real-feel changes):
1. Hard-refresh menu — the `♪ TAP TO ENABLE SOUND` chip should appear briefly, kalimba fades in after first click.
2. Click BEGIN, walk through ~20 questions. Watch the orbiting cards: random colors, fading as they cross in front of the turtle, even distribution.
3. Click UNDO mid-survey — most recent card flies up-left toward camera and shatters into orange-then-ash shards.
4. Reach IntentConfirm — should be a single ask, no double-prompt. Submit a question, watch the "compiling" stage (now ~10-15s including final observer + augur + seer intro).
5. Verify the reading lands. The dump at survey close (use `pipeline` button to inspect, or `debug` chip for state) should show `profile.body` with non-empty `## tensions`, `profile.hooks` populated by algo extract, `profile.side_channel.signals` listing fast/slow picks.

Real-survey artifact dump: there's a markdown dumper somewhere that produces the file the user shared (`tarobot-jake-20260520-1829.md`). It dumps `picks_log` + final engine state. Use it to validate observer output landed correctly.

---

## Things to NOT do

- **Don't add error handling for cases that can't happen.** The engine is internal; trust internal contracts. Zod schemas validate at LLM boundary; algo functions trust their inputs.
- **Don't iterate on prompts in a vacuum.** Real-survey walkthroughs catch failure modes prompt-only review never will. Run the bot harness (`pnpm e2e -- --apiKey=$KEY`) if you change observer/detective prompts substantially.
- **Don't merge story.hooks with profile.hooks.** They live in different places by design — story.hooks is the detective's curated list (~15 high-signal items), profile.hooks is the engine's full algorithmic extraction. The Seer reads both via different paths; don't collapse them.
- **Don't touch the orbiting cards burn animation** unless asked. It's load-bearing for the undo UX and the user explicitly approved the current effect.
- **Don't cut a `v0.0.x` release without the user's explicit ask.** Version strings in `package.json` and topbar can move ahead of tags; the git tag is the bookmark.

---

## Owner / contact

Owner: **jakek** (jakek@github, jcb.kdd@gmail.com). Prefers: terse responses, lowercase tone in product copy, witchy/quiet register, no emoji unless explicitly asked, conventional commit format `type(scope): lowercase one-liner` (see `feedback_commit_style` memory), no `Co-Authored-By` trailer ever.

Project goal: a tarot booth at Burning Man. The deployment is the booth's on-prem LLM running everything in `runtime: local` (today fulfilled by Claude as scaffolding); cloud agents (observer, detective, augur, seer's directors) stay on the Anthropic API. The eventual production system swaps Claude for an OSS local LLM via the `LLMAdapter` interface — that swap is the only major arch change left for v1.
