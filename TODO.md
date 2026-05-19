# tarobot — backlog

Living list of stuff worth doing but not in the current iteration. Roughly
ordered by leverage / hand-feel, not by urgency.

## How to use this file (for Claudes)

This is the scratchpad for **deferred work**. When a user request scopes
out something that should land later, write it here with enough context
that a future agent (or you, in a fresh conversation) can pick it up cold
and execute without re-deriving the design.

**Conventions:**
- Group under a level-2 section by area (`survey`, `reading`,
  `scene / UI`, `eval / iteration`, `infrastructure`).
- Title each item with a short `### imperative phrase`.
- Body should answer: *what changed in the system to motivate this*,
  *what to build*, and *what to watch out for*. Implementation sketch
  is nice but not required.
- Don't delete — strike-through (`~~text~~`) when shipped or mark
  `**DONE in <commit-sha-prefix>**`.
- This file is for *deferred work*, not for *triaging the current
  session*. Real-time scope-tracking belongs in the task list, not here.

**This is not CLAUDE.md.** CLAUDE.md is durable orientation (load-bearing
principles, architecture, conventions). TODO.md is concrete unfinished
work. If something is becoming a convention, move it to CLAUDE.md and
delete from here.

## just-deferred (most recent first)

### relationship_pick: sub-options under a category
The "someone else" sub-list works, but the user has flagged that some
categories (especially `friend`) really want their own sub-pick:
*best friend / childhood friend / family friend / casual friend*. Same
for `parent` (`bio?` checkbox, default checked) — though the user
waffled on whether forcing that detail is worth it.

Cleanest shape: each category in the family/other grid optionally
opens to a small sub-list before landing on the "who specifically?"
screen. Implementation lift = low (one more `mode` state) but
authoring lift = real — every category needs a thoughtful sub-list.
Currently best-friend and childhood-friend live as separate entries
in the "someone else" sub-list as the pragmatic-now answer.

### relationship_pick: optional memo per cast member
After name + pronouns, an optional `anything you want to tell me about
them?` free-text field. Stored as `CastMember.note` (new field). The
detective gets it in its payload as flavor / context (NOT load-bearing
to the survey logic — purely for the seer's downstream prose). Don't
make it required; the friction kills the form if even half of users
have to think about it.

### relationship_pick: friend-closeness slider (mobile-tactile)
For friend-category cast members, a fun interactive "how close are
you" widget. User imagined a "selector toy" — something physical-
feeling on mobile, like a distance measure that you swipe to extend
or contract. Stored as `CastMember.closeness: 0..1`. Pure delight
feature, no detective dependence — but it would give the seer a
texture cue for friend-references that wouldn't otherwise be there.

### floating agent-readouts debug panel
Right-side floating display of each agent's most-recent output (observer,
detective, augur, director, actor). Use case: watch what the detective is
producing turn-by-turn during a survey without bouncing to the Pipeline
page. Layout: stacked panels along the right edge, each panel ~280px wide,
scrollable, showing the last call's input + output for one agent. Wire to
the existing `publishDebug` bus and gate behind the existing debug toggle.

### walkthrough + v0.0.2 release
End-to-end walkthrough of the full survey → reading flow. Verify:
- save threshold behaves correctly (no localStorage litter before threshold)
- returning-user RESUME / START FRESH paths both work
- relationship_pick carries cast (pronouns + color + off_limits) through
  to the reading
- IntentConfirm sandwich closes the survey cleanly
- Seer constructor receives `surveySynthesis` and uses it as the spine of
  `prose_brief`
- four-card spread plays through with no regression
After verified, tag `v0.0.2` and bump `version` in `package.json`.

### warning-that-lands as a first-class concept
The seer's value-prop includes warning-that-lands: a specific blindspot
or pitfall named with weight, not a generic caution. Today this is
implicit — cognition's `intent` field on a Set CAN be a warning verb,
but there's no structured support. The reading depends on cognition
landing on a warning verb in the right moment, which is fragile.

Engineer it as a first-class output:

  Set { ... warning?: { specific_thing_to_watch_for, why_now } }

Cognition emits it only when the card+context genuinely supports it.
Persona renders it in voice ("the part of you that handled it last
time is not the part that handles it now"). Low-stakes when null;
load-bearing when populated. Should land 1-2x per reading max — over-
emit and warnings become noise.

### webcam / live-reaction capture (production, much later)
In production, the tarot reading is a live experience. Atmosphere is
delivered by peripherals (table, candle, scene). The reads-the-room
loop could pull from a webcam: user expression (mild surprise vs flat),
posture shifts, sustained gaze on a specific card.

This is far future. Note here because it changes what "cognition
sees between cards" eventually looks like — not just chat-history, but
affect signals. Until then, chat history + per-beat-flip latency is
the only reaction channel.

### underline emphasis — markup-driven, animated-in-hindsight
User wants the seer's monologues to underline key phrases with an
animated `clip-path` reveal that lags slightly behind the typewriter —
as if someone reading along is marking up the text. Four moving parts:

1. **Persona prompt update.** Teach the persona to mark spans with a
   syntax like `_phrase_` (single underscores around the words to
   emphasize). Explicit instruction: emphasize *phrases that carry
   weight*, NOT proper nouns or card names (those have their own
   highlight). Maybe 1-3 spans per beat.
2. **Parser.** New helper that strips the markup chars and returns
   `{ text: string, ranges: Array<{ start: number; end: number }> }`.
   Live in `src/ui/dialogue/parseEmphasis.ts`.
3. **Rendering.** ChunkedLine currently renders `displayed` (the
   typed-so-far). It needs to walk the ranges and wrap any range whose
   `end` is ≤ `displayed.length - LAG_CHARS` in an animated `<span>`.
   The lag (LAG_CHARS ~ 10) is what produces the "in hindsight" feel.
4. **CSS.** Keyframe `@keyframes underline-wipe { from { clip-path:
   inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }` applied
   to a `::after` border-bottom on the emphasis span. ~0.4s duration.

Watch out: card-name highlights from `highlightNames` already wrap
spans inside the text — the emphasis parser needs to operate on the
RAW text before highlightNames runs, OR be span-aware. Simpler is to
parse emphasis first and have highlightNames be the inner pass.

### lifted-card hover physics + tap-spin
User sketched: hovering over the lifted card with the cursor produces
spring repulsion (like Clat in survey), tethered to LIFT_POS. Clicks
add angular velocity (rotation.z); spin decays slowly; "tetherball" feel
— rapid clicks compound up to a cap.

Current blocker: the picker (`pickAt` in TarobotScene) filters to
`face_down` stage. Need a separate raycast against the lifted card with
its own `onPointerMove` (distance test → spring force) + `onPointerDown`
(angular impulse based on `(clickX - cardCenterX)` direction).

State on the rig: `offsetPos: Vector3`, `offsetVel: Vector3`,
`spinVel: number`. Each frame: `springAccel = -k * offset; offset +=
vel * dt; vel *= damping`. Spin: `rotation.z += spinVel * dt;
spinVel *= 0.985`.

### pixel-art SVG card symbols (78 assets)
Emoji on cards is acceptable interim but doesn't fit the CRT / dark
turquoise aesthetic. Replace with 26 unique inline-`<rect>` pixel-art
SVGs:
- 22 majors (one per card)
- 4 suits (cups, wands, swords, pentacles — minor cards share their
  suit's symbol)

Constraints: 24×24 pixel grid, single accent color (the card's BORDER),
no anti-aliasing, no PNG fallback. Replace the emoji-to-canvas-texture
pass in `cardTexture.ts` with an inline SVG-to-canvas blob load.

Style ref: user's "blob silhouette" sketch + the Inscryption pixel-art
look. Each SVG should be instantly recognizable at 32px tall.

## eval / iteration (the apparatus)

### replay rig
The single highest-leverage investment per the long apparatus convo.
Library of fixed mock-user transcripts + one-command runner that takes
(config, transcript) → (full pipeline output, intermediate state).
Cached intermediate states so unchanged components don't re-burn tokens.
Side-by-side diff view across configs.

15-20 archetypes covering the space, including adversaries: shitposter,
drunk, cynic, silent one, group-of-friends, person mid-crisis. Marisol
in `fixtures.ts` is one fixture — needs 14-19 more.

Without this, every change is vibes-based; with it, 30 experiments
before breakfast.

### failure-mode catalog
Build a named anti-rubric list. Known suspects so far:
- therapy-speak ("I understand you're going through a hard time...")
- advice-shaped reading (telling the user what to do)
- fortune-cookie generality
- interrogator (>1 on-the-nose question per turn)
- generic horoscope (could apply to anyone)
- breaks character to be helpful
- "I'm an AI" tell
- names the card as if reading from a glossary
- pacing failures (stall, dump, infodump)
- self-recitation (persona quoting the Set's contents back rather
  than performing from them — the rename-to-Set conversation's
  load-bearing concern)

Each failure mode becomes a tiny LLM-as-judge prompt (different model
from the one that produced the output): "does this contain failure
mode X? yes/no + 1-sentence justification". Run all of these against
every replay-rig output; pipeline change = numeric delta.

### ground-truth evaluator
Per the synthetic-eval convo: synthetic users have a rich uncompressed
backstory hidden from the pipeline + a thin compressed profile the
pipeline reads. Evaluator scores readings against the hidden backstory
on inference-quality axes (touched real fork / ground-truth-supported /
ground-truth-contradicted / generic-to-specific calibration).
Different model from the pipeline. Pairs with the failure catalog as
the negative bench.

### slate playtests (later — needs real users)
Two months out from real-user contact. Lock 3-5 candidate full configs
before running anyone through them. Each playtest = one config in
rotation. Record everything: full pipeline state, timing, intermediate
cognition, audio if available. Half the value is post-hoc forensics.

## architectural debt (deferred refactors)

### TarobotScene split into layers/
`src/ui/scene/TarobotScene.tsx` is ~1200 lines, one useEffect, ~10
concerns braided together (renderer, composer, ortho cam, perspective
cam, Clat sprite + mouse react + blink, eyes mesh + canvas paint,
particles, orbs, table GLB, 4 card rigs + tweens + picker, scissored
2nd render). Target:

```
scene/TarobotScene.tsx       ← orchestrator only (renderer, composer, RAF)
scene/layers/clat.ts         ← { create(scene), update(dt, t), dispose() }
scene/layers/eyes.ts
scene/layers/particles.ts
scene/layers/orbs.ts
scene/layers/table.ts
scene/layers/cards.ts
```

Drops orchestrator to ~150 lines. Each layer ~100-200. Cleanup
becomes per-layer instead of tracing the whole file.

### Reading.tsx stages → engine
Reading.tsx still derives the per-slot `stages` map (`face_down /
face_up / lifted`) from `state.phase + state.revealed + state.current_slot`
and pushes it to `cardSceneStore`. Move that derivation into the engine
as a first-class `state.stages: Record<SlotName, CardStage>` field. UI
subscribes to one source of truth instead of recomputing.

### Reader.tsx wrapper is vestigial
`src/ui/reader/Reader.tsx` is now just `<ReaderAnchor size={size} />`
with two dead props (`isSpeaking`, `mood`) "for API parity." Delete
Reader.tsx, route Menu + Survey to ReaderAnchor directly, drop the dead
props. ~10min.

### scene/ barrel + bus-pattern doc
7 store/service modules in `scene/` (anchor, tableAnchor, dizzy, impact,
readerMode, cardScene, pickService) — all deep-imported. Add
`scene/index.ts` barrel exporting the public surface + a 5-line comment
at the top explaining the bus pattern.

### engine error tagged union
`ReadingState.error?: string` allows setting `error` without
`phase: 'error'`. Combined, they become inconsistent state with no
visible symptom (UI only renders the error string under `phase ===
'error'`). Move to a tagged union: error only ever exists alongside
`phase: 'error'`.

### perspective bloom (render-strategy two-pass)
Currently composer + bloom only runs on the ortho scene; perspective
renders directly to canvas via scissor after `composer.render()`. Bloom
doesn't apply to the table / cards. Fine for now (emoji silhouettes
aren't bright enough to need bloom), but anyone adding a glowing card
or table accent will be confused. Proper fix: dual EffectComposer +
final composite pass. Not urgent until a glowy card element ships.

## survey

### question prefix extraction
Several pool nodes share a prefix across their answer options:

- `whats_true` — every option begins with "something is …"
- `who_in_head` — 3 of 4 options begin with "someone …" (the outlier is "no one")
- `what_is_stuck` — pure variation, no shared prefix
- `time_orientation` — "the …" prefix on 3/4

For the cases with a clean shared prefix, the prefix could be extracted into
the question text (indented one tab, in brand purple) and the buttons reduced
to just the differentiator. e.g. `what's true right now?` followed (indented)
by `something is …` and buttons `stuck` / `unsaid` / `ending` / etc.

The edge case: `who_in_head` has "no one" which doesn't fit the "someone"
prefix. So this isn't a pure tree-level transformation — the tree would need
to mark which answers share the prefix and which break out. Probably an
optional field on the node, e.g. `answer_prefix: "something is "` plus a
per-answer flag that overrides.

Implementation sketch:
- Add `answer_prefix?: string` to TreeNode
- In renderQuestion: if all answers (after the prefix) are unique, strip the
  prefix from each and inject it as a sub-line of the dialogue text
- Mark answers that should NOT take the prefix (e.g. "no one" on who_in_head)
  with a leading sentinel like `!no one` in the tree

Backlog this until the survey gets another revision pass — small UX polish
that needs care to not over-engineer.

### the vague-info concern
User flagged: vague checklists ("something is stuck" + "something is unsaid")
may produce a Profile.brief that confidently mis-states what's going on. The
Observer infers a person, infers stakes, infers a fork — based on signals
that are inherently vague.

Possible mitigations:
1. **Confidence levels through to the brief.** Already present in the
   Choice type but not always surfaced in the prose_brief. Reinforce in the
   Compiler prompt: "low confidence" claims must be hedged in prose ("appears
   to be" not "is").
2. **Stop inferring cast members from a single vague signal.** Cast.confidence
   should require multiple supporting picks, not one.
3. **Add `i don't know` / `not really` / `nothing comes to mind` as a
   first-class non-answer.** Multi-select with 0 boxes already means "nothing
   is", but for single-choice questions there's often no clean opt-out beyond
   `pass` (which is filtered).
4. **Investigator-injected text questions.** When inference confidence is
   middling, the Investigator could surface a text-input follow-up that asks
   directly for the specific thing. See below.

### investigator-injected text questions
User idea — currently all roots are multi-choice. The Investigator should be
able to inject a single text-input question as a "special root" when it spots
a thread worth pinning down specifically. Constraints:

- Only one special question may be queued at a time (so the choice rhythm
  isn't broken by back-to-back free text)
- Looks like a normal question to the user except the input is a text field
- Counts as a regular root in the queue
- Output goes directly into the Profile as a quote, not interpreted

Implementation sketch:
- Add `f: 'text'` (already exists) to InvestigatorOutput.next_question's
  allowed formats when GENERATED
- Engine accepts `GENERATED` with `f: 'text'`, an `options: []` array, and a
  `text` field that becomes the question prompt
- A flag in EngineState tracks `has_pending_special_question` so the next
  Investigator call knows not to inject another

### returning-user UI
Data layer done (`findReturningUser`, `seedFromReturning`, engine accepts
returning seed at construction). Missing: the "is this you?" modal on name
collision. Should appear after the name is submitted; offers options for each
match with disambiguator (birthday year), or "no, different name". On
confirm, the engine reboots with the returning seed so heat starts at 0.45
and openers 2-4 are skipped if data is present.

### heat / saturation comeback
Removed in 314b850 per direction. If the survey gets too rambly without a
close signal we can reintroduce a soft "she's heard enough" trigger — but
ideally that's the Investigator's saturation_signal, not a turn-count cap.

## reading

### chat-staleness in fan-out
Round-N fan-out spawns when the user advances out of the round-(N-1) beat
(or at boot for round 1). If the user chats during the awaiting_flip that
follows, those chat messages are NOT in the pre-computed monologue for
the slot they then pick. Chat REPLIES are always fresh; only the per-card
beat monologues miss this signal.

Mitigation options:
- on chat submit, invalidate `slotPromises`/`slotResults` for the current
  round and re-spawn fan-out with the updated chat snapshot. Wasteful
  (3 extra calls per chat exchange) but accurate.
- only invalidate the slots the user has NOT picked yet — by the time
  they pick, the prior cards' fan-out is irrelevant.
- accept the gap; let the chat reply absorb anything the user said that
  would have mattered. Cheapest, lowest fidelity.

### orphan openers
`CompilerOutput.openers` is still generated by the Compiler (Sonnet), shipped
in the brief, and stashed in the session — but Reading.tsx never reads them.
They were for the dormant tent flow. Either drop the field from the schema
(and stop spending tokens generating it) or wire them as conversation seeds
for the chat side of the reading. Code smell either way.

### demo profile rotation
`fixtures.ts` currently has one demo profile (Marisol). Adding 2-3 more
archetypes (the cynic, the avoidant, the person in active crisis) would
let us run the READ DEMO path against multiple fork shapes without a
survey rebuild. The Menu could have a small dropdown next to READ DEMO,
or a sub-menu of demo names.

### local OSS LLM swap path
All persona-tier calls (`personaIntro`, `personaPerCard`, `personaClosing`,
`personaChat`) route through `adapter.invoke` with `model: 'deep'`. The
local adapter swap lives at `MODEL_FOR.deep` in `adapter-anthropic.ts`
(or a new adapter implementation entirely). Cognition stays Anthropic.
The `awaiting_tier` field already telegraphs which side is the bottleneck.

### shared voice bible could be cache-anchored
`SEER_VOICE_BIBLE` is concatenated into 4 prompt strings. If we adopt
Anthropic prompt caching, mark the bible as a cache anchor and pull
per-call instructions into the user message tail instead.

### per-card cognition's narrative_role override
The cognition prompt asks the model to derive `narrative_role` from
`flip_round`, but the engine ALSO normalizes it post-hoc
(`{ ...clinical, narrative_role: role, flip_round: round }`). Belt and
suspenders. One of the two could go; keeping the engine normalization
is safer.

## scene / UI

### Clat animations from claude-cat repo
User has a `Code/claude-cat/` repo with a compacting animation (eyes spin)
and likely other affectations worth porting. Currently the dizzy state uses
a synthetic eye-spin (cycle through 8 look-direction frames). Native
animations would feel more deliberate.

### layout responsiveness
The pinned layout (commit pending) targets one desktop size. Mobile sizing
is still inherited from the existing media queries. Worth a dedicated pass:
single mobile breakpoint, fixed dimensions at that breakpoint too, no
sliding between sizes mid-survey.

### transcript viewer
Survey runs are saved to `tarobot:survey-logs` in localStorage. There's a
download button on the closed screen, but no in-app way to browse past runs.
Add a "logs" subsection under Settings.
