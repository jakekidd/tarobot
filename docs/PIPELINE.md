# Tarobot Survey Pipeline — current shape

Living doc. The source of truth for "what's actually running" — read this
before reading REFACTOR-V3.md (which is older planning context).

Last meaningful update: compiler-as-sieve + intention-precedes-compiler
+ WEAVER agent design.

---

## Phases

```
PHASE 1 — OPENERS
  name → birthday → relationship_status → intent
  deterministic, no AI fires.
  birthday > 100 yrs old triggers centenarian interlude (sassy lamp-hang).

PHASE 2 — PILLARS (5 questions, fixed order)
  basics / goes_quiet / body_baseline / center_of_life / want_most.

  Per pillar answer (serial submit, NO LLM calls during pillars):
    (a) submitAnswer captures pick, computes latency-z incrementally,
        pushes pick entry (with negative_space + z-score) to transcript.
    (b) algorithmic seeder runs inline (deterministic, no LLM):
          reads node.probe.inversions
          drops Probe seeds onto state.doc.held
        These feed the Seer's closing director as 'held probes'.
        Upgrade pending: a richer declarative mark/glyph attachment
        system driven by the pillars markdown — see TODO at bottom.

  Dowser DOES NOT fire during pillars. Calibration only.
  No LLM calls until interrogation begins.

PHASE 3 — INTERROGATION (dowser-driven)
  Triggered when last pillar answered.

  refillGuessQueue() — DOWSER in background loop:
    while (queue.length < 3 && voiced_count < 6):
      blob = runDowser(state)   // Opus, freeform, 4K tokens
      // text-blob output: thinking, ===HYPOTHESES===, ===GUESS===,
      // ===IF_WARM===, ===IF_COLD===
      state.dowser_thinking += blob.thinking
      state.hypotheses = blob.hypotheses    // re-listing = vote
      guess_queue.push(blobToQueuedGuess(blob))

  User sees queue head as WarmColdChoice (blue COLD left, orange WARM
  right). On pick:
    (a) parse 'warm' / 'cold' / '<dir>:<correction>'
    (b) push 'guess' (voiced) + 'response' (direction + correction)
        entries to transcript
    (c) correction text → verbatim_log (source='correction')
    (d) pop queue head
    (e) refillGuessQueue() refills in background

  WEAVER (shipped) — Haiku, fires every 2 answered guesses in
    background (~3 calls across the 6-guess ceiling):
    state: state.weaver_candidates: PotentialDilemma[] = {
      label, description, thoughts[],
      created_at_turn, last_extension_turn, extension_count
    }
    each call: agent rewrites the full set (label/description/
      thoughts only — engine merges trajectory). Re-listing same
      label IS the vote — engine never tells the agent about the
      counter. Engine maintains trajectory fields by diffing the new
      set against the prior set; surfaces durability to the compiler.
    discipline: prefer growing thoughts on an existing label over
      adding new ones; small set (2–3 healthy, 5 max); evidence-
      anchored thoughts only (cite warmth + verbatim entries).
    knows: run_idx + run_total (calibration awareness, the one
      exception to "no machinery in prompts").
    owns a THREE-STATE engagement read (Mr Brainstorm middle-rung
      addition; ratchet-only-down):
      - 'live'      — at least one candidate gaining new evidence
                      OR user still anchoring with corrections. keep
                      going.
      - 'wind_down' — borderline. stop refilling but let the queued
                      guesses ride out gracefully, then close.
      - 'flat'      — clear disengagement. drop the queue NOW, close
                      after the current question.

  Terminates when:
    - voiced_count >= 6 AND queue empty (budget ceiling), OR
    - WEAVER engagement ∈ {wind_down, flat} AND queue drained.
  Then → Phase 4. beginIntentionStage awaits WEAVER quiescence before
  running the compiler so the candidate set is fresh.

PHASE 4 — INTENTION (between hunt and close)
  User lands on intention input. beginIntentionStage ran
  applyAlgoExtraction + waitForWeaverQuiescence and transitioned to
  'awaiting_intention'. Immediately after the transition, the engine
  fires runIntentionSuggestionsTask:
    - 1 parallel call per WEAVER candidate (typically 2-5)
    - tier: cognition (Sonnet) — user-visible chip text needs texture
    - each call pushes its result into state.intention_suggestions
      as it lands; UI renders chips incrementally
    - generator prompt orient: "include the details that make this
      question unmistakably theirs, leave out the rest" — relevance
      over strict dilemma-only
  Chip click submits directly. User can also type their own.
  The pick is the highest-quality disambiguation signal in the session.

PHASE 5 — COMPILE (compiler-as-sieve, fires inside submitIntention)
  Engine ordering: beginIntentionStage now stops at applyAlgoExtraction
  + waitForWeaverQuiescence and transitions to 'awaiting_intention'.
  The compiler does NOT fire here anymore.

  When the user submits their intention (submitIntention), the engine
  enters 'compiling' and the compiler-as-sieve fires AS THE FIRST step
  of the post-intent pipeline — before Augur, before Seer. The compiler
  reads:
    - user_intention (primary filter)
    - weaver_candidates (the small curated set WEAVER built)
    - full unified transcript + verbatim_log
    - dowser_hypotheses (advisory)

  Three resolution paths (set on the output as resolution_path):
    (a) matched-candidate    — intent maps cleanly to a WEAVER
                                candidate → write that one in detail
    (b) strongest-candidate  — intent is thin/placeholder → fall back
                                to the juiciest WEAVER candidate
    (c) created-from-intent  — intent reveals territory WEAVER +
                                dowser missed → CREATE a new
                                Dilemma. trust the user.
    (d) null-landing         — session genuinely thin → emit "no
                                Dilemma resolved" rather than invent.

  Output is the DilemmaDocument (full schema in
  `docs/DILEMMA-SCHEMA.md`):
    - Dilemma core (label, delta_description, fork.do_nothing_branch +
      alternative_branch, awareness, confidence, domain_tags,
      null_landing flag)
    - critical_hypotheses[] — load-bearing claims with anchored evidence
    - freeform regions (specifics, holding, suspicions—fenced)
    - resolution_path provenance

  Engine stores both: state.dilemma (structured) + state.anchor
  (markdown render via renderDilemmaAsAnchor; persisted with the
  Person record and read by the legacy Seer assembleProfile bridge).

  Streaming Opus + extended thinking. Streams to ThinkingStreamView.

  Loaded sessions (loadFromSave with a prior anchor) skip the compiler
  call — their anchor carries the prior visit's resolved Dilemma.

PHASE 6 — READING (out of scope here)
  Augur (intention-time outcome forecasts) → Seer engine constructed →
  cards laid → reading delivered.
```

---

## Active agents (sorted by phase)

| Agent | Phase | Tier | Pattern |
|---|---|---|---|
| algo-seeder | 2 (pillars) | local, deterministic | Per pillar, no LLM — drops Probe seeds onto doc.held from question Inversions. Upgrade pending. |
| DOWSER | 3 (interrogation) | Opus, freeform | Background loop, 3-ahead lookahead, text-blob output |
| WEAVER | 3 (interrogation) | Haiku | Every 2 answered guesses, curates candidate set, owns terminate signal |
| INTENTION-SUGGESTOR | 4 (intention) | Sonnet | Parallel — one short-sentence helper per WEAVER candidate, populates intent chips |
| COMPILER | 5 (compile) | Opus + ext.thinking | Streams, once-per-session, sieve-shaped |
| AUGUR | 6 (reading) | Sonnet→Opus | unchanged legacy |

---

## Load-bearing principles (these survive all refactors)

- **Profile the problem, not the person.** Interior reads → suspicions
  fence; never quotable downstream. Dilemma = situation + fork, not a
  personality verdict.
- **WARM/COLD is absolute, not gradient.** COLD = eliminate a region,
  NEVER invert to the opposite. The dowser + compiler both need this.
- **Corrections (user free-text) are the gold signal.** Above warmth,
  above algorithmic priors, above dowser leading-hypothesis.
- **Re-listing as vote (organic).** Never tell the agent the counter
  exists. Pure signal from natural behavior, not actions taken to
  satisfy a mechanic.
- **Interrogation supersedes pre-hunt calibration.** The
  algorithmic seeder drops priors during pillars; the warm/cold map
  is later and tested. When priors disagree with warmth, warmth wins.
- **Dowser's leading hypothesis is advisory, not binding.** The
  hunter wanting something to be true is not evidence it is.
- **Engagement read closes the alienation seam.** Phase 3 can't only
  terminate on budget. WEAVER owns the early-out.
- **Compiler creates the Dilemma in light of the user's intention.**
  It is the sieve. The user's intention is the final filter — and a
  passionate intent that the agents missed CAN override the entire
  candidate set.
- **Never manufacture.** Null-landing is a valid terminal state. Better
  to ship "no Dilemma resolved" than to invent one.

---

## What's still TODO (high-signal)

1. **Algo-seeder upgrade** — Mr Brainstorm's Loom sketch in hand:
   axes-with-variance (not flat tags), per-option declarative
   attachments in the pillars markdown (`toward / away from <axis>`
   with mild/clear/strong strength keywords), accumulation surfaces
   contradiction as high variance, drop the age modulator (hand age
   as soft context to LLM agents, not as a mechanical rotor).
   Pending: design doc + implementation.
2. Live playtest of the WEAVER + compiler pipeline once API credits
   are restocked. The audit-style critique above is structural; some
   suspected weaknesses may evaporate when WEAVER faces real WARM/
   COLD signal.
3. Dowser text-blob streaming (debug-only UI affordance) — #34.

Completed in the WEAVER + compiler-as-sieve wave: WEAVER agent (#27),
engagement early-out (#28), pipeline diagram correction (#30),
compiler-as-sieve refactor (#31), Dilemma document schema (#32),
intention-suggestion chips (#29), Seer profile wiring (#35), WEAVER
trajectory tracking (engine-maintained durability per candidate),
WEAVER three-state engagement (live / wind_down / flat ratchet-
only-down). Plus Haiku-seeder deletion, parser fuzz suite, prompt
audit, per-agent freeform labels, and the PSYCH→WEAVER rename.
