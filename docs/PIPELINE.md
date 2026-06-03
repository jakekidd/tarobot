# Tarobot Antechamber Pipeline — current shape

Living doc. The source of truth for "what's actually running" in the
antechamber (the pre-reading interview). Read this before REFACTOR-V3.md
(older planning context that lags reality).

Last meaningful update: diviner batched generation (LOCATE emits 3 then 2 in
one call to force breadth; COMPOSE drills 1/turn) + per-guess response
prediction + birthday moved to end-of-pillars + intent opener dropped + PLAY
intro / preface beats.

> **In transition.** The diviner was just rewritten and now banks HOT
> hypotheses into `state.candidate_shapes`. WEAVER and the compiler have
> NOT yet caught up: WEAVER still maintains its own `weaver_candidates`
> set and the compiler still reads `weaver_candidates`, not
> `candidate_shapes`. The LivingDoc's structured `story` slots and the
> standalone "observer" write-path are vestigial after the rewrite. The
> seam is called out at each phase below. Don't treat the two candidate
> paths as settled — reconciling them is live design work.

---

## Phases

```
PHASE 1 — OPENERS
  name → relationship. Deterministic, no LLM fires.
  'intent' ("do you have a question for the cards?") is dropped from the flow
  (node kept). Birthday is NO LONGER an opener — it's asked at the END of the
  pillars (Phase 2). Returning-user name match overlays ReturningUserModal.

PHASE 2 — PILLARS (9 questions, fixed order)
  5 baseline structural questions + 4 charge/orientation/loop/stance
  questions (charge-domain, time-orientation, loop, stance). The canonical
  list, ordering, and per-question Probe schema live in materials/pillars.md
  — read that, don't duplicate it here (it churns).

  Per pillar answer (serial submit, NO LLM calls during pillars):
    (a) submitAnswer captures the pick, computes latency-z incrementally,
        pushes the pick (with negative_space + z-score) to the transcript.
    (b) the algorithmic seeder runs inline (deterministic, no LLM):
          reads the answered node's `Inversions:` probe text
          drops Probe seeds onto state.doc.held
        These feed the Seer's closing director as 'held probes'.

  No agent fires during pillars. Calibration only.

  After the 9 pillars, the birthday form is asked (identity + astro profile;
  applyOpenerDataIfRelevant computes sun sign / life path / birth card). Then
  a PLAY intro beat, then the guessing. The main queue drains before the
  guess_queue, so order is: pillars → birthday → PLAY → guesses.

PHASE 3 — INTERROGATION  (informally "the Sounding")
  The post-pillar guessing period. NOT a formal state enum — `stage`
  stays 'questions' and `phase` is the A–E register label (derived from
  turn count, see phase.ts). Two silent agents drive it:

  DIVINER (deep / Opus, background loop — refills the guess queue):
    Emits a freeform thinking pass then N ===GUESS=== blocks, each with:
      hypothesis:  one line, in the user's voice as a question
      guess:       one voiced line the user reacts to
      predict:     the diviner's prior on the response (COLD / WARM / HOT)
    GUESS_BUDGET = 20, in two sub-phases:
      LOCATE  (1–5)  — emitted in BATCHES (3 in one call, then 2) so the model
                       must spread across distinct domains in ONE generation.
                       This is the perseveration fix: one-at-a-time it kept
                       re-anchoring on the loudest signal and rephrasing it.
      COMPOSE (6–20) — one guess per call, after each response (no pre-gen down
                       the tree). A refine MUST add a concrete specific;
                       rewording the same shape is forbidden.
    The (hypothesis, guess, predict, response) trajectory is bundled inline for
    the diviner. predicted-vs-actual is a calibration / surprise signal.

  User responds via the three-state COLD / WARM / HOT choice
  (src/ui/choices/WarmColdChoice.tsx — COLD blue, WARM orange, HOT red),
  or types a free-text correction:
    - COLD  → eliminate this region (absolute, never inverts to the opposite).
    - WARM  → resonant; keep pulling the thread.
    - HOT   → strong resonance; the engine BANKS the active hypothesis into
              state.candidate_shapes[] (append-only, deduped).
    Free-text corrections route to verbatim_log (source='correction') and
    are the highest-signal channel in the session.

  WEAVER (fast / Haiku, fires every 2 answered guesses):
    Rewrites state.weaver_candidates (PotentialDilemma[]) wholesale each
    call — re-listing the same label IS the vote; the engine never tells
    the agent about the counter and maintains trajectory/durability by
    diffing the new set against the prior. Discipline: small set (2–3
    healthy, 5 max), evidence-anchored thoughts only.
    Owns a THREE-STATE engagement read via ===ENGAGEMENT=== (ratchet-only-
    down): 'live' (keep going) / 'wind_down' (stop refilling, let the queue
    ride out) / 'flat' (drop the queue now, close).

  HOT banks the active hypothesis into candidate_shapes[] (append-only, deduped).
  Sounding exits when EITHER:
    - the guess budget (20) is reached, OR
    - weaver_engagement ∈ {wind_down, flat} AND the queue has drained.
  Banking no longer closes the game early — the 3-banked auto-exit was removed
  so the full 20-guess game runs. Then → Phase 4.

  ── SEAM ──────────────────────────────────────────────────────────────
  The diviner now banks candidate_shapes, but WEAVER's weaver_candidates is
  still the set the compiler consumes (Phase 5). The two are not yet
  reconciled. Whether candidate_shapes should feed/replace weaver_candidates
  — and whether WEAVER survives the diviner rewrite at all — is open.

PHASE 4 — INTENTION  (between the hunt and the close)
  The intention stage begins (waits for WEAVER quiescence so the candidate
  set is fresh) and the engine fires the intention-suggestor:
    - cognition (Sonnet), one parallel call per weaver_candidate (~2–5).
    - each result pushes into state.intention_suggestions; UI renders chips
      incrementally as they land.
    - orient: "include the details that make this question unmistakably
      theirs, leave out the rest" — relevance over strict dilemma-only.
  Chip click submits directly; the user can also type their own. The pick
  is the highest-quality disambiguation signal in the session.

PHASE 5 — COMPILE  (compiler-as-sieve, fires inside submitIntention)
  On submitIntention the engine enters stage 'compiling' and the compiler
  fires as the FIRST step of the post-intent pipeline — before Augur,
  before the Seer. It reads:
    - user_intention      (primary filter)
    - weaver_candidates   (the curated set WEAVER built — NOT candidate_shapes; see seam)
    - full unified transcript + verbatim_log
    - diviner hypotheses   (advisory)

  Resolution paths (set on the output as resolution_path):
    matched-candidate    — intent maps cleanly to a WEAVER candidate.
    strongest-candidate  — intent is thin → fall back to the juiciest candidate.
    created-from-intent  — intent reveals territory the agents missed → CREATE.
    null-landing         — session genuinely thin → "no Dilemma resolved".

  Output is the DilemmaDocument (full schema in docs/DILEMMA-SCHEMA.md).
  The engine stores both state.dilemma (structured) and state.anchor
  (markdown render, persisted with the Person record and read by the Seer
  bridge). Streaming Opus + extended thinking → ThinkingStreamView.

  Loaded sessions (a prior anchor present) skip the compiler — the anchor
  carries the prior visit's resolved Dilemma.

PHASE 6 — READING  (out of scope here; see docs/READING-ANATOMY.md)
  Augur (intention-time outcome forecasts, cognition outline → deep fill) →
  SeerEngine constructed → cards laid → reading delivered.
```

---

## Active agents (sorted by phase)

| Agent | Phase | Tier / runtime | Pattern |
|---|---|---|---|
| algo-seeder | 2 (pillars) | deterministic, no LLM | Per pillar — drops Probe seeds onto doc.held from the node's `Inversions`. |
| DIVINER | 3 (interrogation) | deep / Opus · local | Background loop refilling the guess queue. Singular `===HYPOTHESIS===` + `===GUESS===`; LOCATE→COMPOSE; budget 20. HOT banks candidate_shapes. |
| WEAVER | 3 (interrogation) | fast / Haiku · local | Every 2 answered guesses. Curates weaver_candidates (re-listing = vote); owns the live/wind_down/flat engagement early-out. |
| INTENTION-SUGGESTOR | 4 (intention) | cognition / Sonnet · cloud | Parallel — one short-sentence chip per weaver_candidate. |
| COMPILER | 5 (compile) | deep / Opus + ext. thinking · local | Streams, once per session, sieve-shaped. Emits the DilemmaDocument. |
| AUGUR | 6 (reading) | cognition → deep · cloud | Outline (Sonnet) then fill ×N (Opus). |

(Runtime `local`/`cloud` is the prod-deployment designation — see CLAUDE.md
"Local vs cloud". Today every call is Claude scaffolding.)

---

## Load-bearing principles (these survive the churn)

- **Profile the problem, not the person.** The Dilemma is a situation +
  fork, not a personality verdict. Interior reads stay fenced and are
  never quotable downstream.
- **COLD / WARM / HOT is absolute, not gradient.** COLD eliminates a
  region; it NEVER inverts to the opposite. HOT is strong resonance and
  banks a candidate shape. The diviner and compiler both depend on this.
- **Corrections (user free-text) are the gold signal** — above warmth,
  above algorithmic priors, above the diviner's leading hypothesis.
- **Re-listing as vote (organic).** Never tell an agent the counter
  exists. Signal comes from natural behavior, not from gaming a mechanic.
- **The diviner's leading hypothesis is advisory, not binding.** The hunter
  wanting something to be true is not evidence it is.
- **The engagement read closes the alienation seam.** Phase 3 must be able
  to end early, not only on budget. WEAVER owns that early-out today.
- **The compiler creates the Dilemma in light of the user's intention.**
  It is the sieve; the intention is the final filter, and a passionate
  intent the agents missed CAN override the entire candidate set.
- **Never manufacture.** Null-landing is a valid terminal state. Ship "no
  Dilemma resolved" rather than invent one. (This is also where Discovery-
  mode tarot would eventually branch — deferred; one mode done well first.)

---

## In flight / next (high-signal, expect change)

1. **Reconcile candidate_shapes vs weaver_candidates.** The diviner banks
   the former; the compiler reads the latter. Decide whether the banked
   HOT shapes feed, enrich, or replace the WEAVER set — and whether WEAVER
   stays at all. This is the headline open question after the diviner rewrite.
2. **Hypothesis threading (under discussion).** Treat the diviner's singular
   hypothesis as a persistent thread id the engine tracks across turns
   (continue / refine / contradict / abandon), so the compiler can read
   thread-level signal instead of a flat trajectory. In-prompt threading
   first; a separate eval-step agent only if the in-prompt version flails.
3. **Prompt caching for the diviner.** The doctrine prefix is static across
   the 6–20 diviner calls per Sounding; mark it `cache_control: ephemeral`
   for a real latency + input-cost win. Isolated from the threading work.
4. **Discovery leads out of the compiler.** Extend the compiler output with
   self-discovery observations (patterns/contradictions/gaps) the seer can
   weave as side-beats without losing the Dilemma spine. Iterate the prompt
   in the Bench SANDBOX against synthetic post-Sounding states before wiring.
5. **Vent path.** `alleged_problem` is stubbed to "none"; handling users who
   just want to vent is unbuilt.
