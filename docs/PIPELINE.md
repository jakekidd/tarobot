# Tarobot Survey Pipeline — current shape

Living doc. The source of truth for "what's actually running" — read this
before reading REFACTOR-V3.md (which is older planning context).

Last meaningful update: compiler-as-sieve + intention-precedes-compiler
+ PSYCH agent design.

---

## Phases

```
PHASE 1 — OPENERS
  name → birthday → relationship_status → intent
  deterministic, no AI fires.
  birthday > 100 yrs old triggers centenarian interlude (sassy lamp-hang).

PHASE 2 — PILLARS (6 questions, fixed order)
  basics / goes_quiet / body_baseline / center_of_life /
  value_most / fork.

  Per pillar answer (serial submit, parallel background):
    (a) submitAnswer captures pick, computes latency-z incrementally,
        pushes pick entry (with negative_space + z-score) to transcript.
    (b) SEEDER fires (Haiku, freeform):
          input:  transcript + this_turn + verbatim_log
          output: 0-6 short observation lines
        appended to transcript as 'seeder_obs' entries.

  Detective DOES NOT fire during pillars. Calibration only.

PHASE 3 — INTERROGATION (detective-driven)
  Triggered when last pillar answered.

  refillAssertionQueue() — DETECTIVE in background loop:
    while (queue.length < 3 && voiced_count < 6):
      blob = runDetective(state)   // Opus, freeform, 4K tokens
      // text-blob output: thinking, ===HYPOTHESES===, ===ASSERTION===,
      // ===IF_WARM===, ===IF_COLD===
      state.detective_thinking += blob.thinking
      state.hypotheses = blob.hypotheses    // re-listing = vote
      assertion_queue.push(blobToQueuedAssertion(blob))

  User sees queue head as WarmColdChoice (blue COLD left, orange WARM
  right). On pick:
    (a) parse 'warm' / 'cold' / '<dir>:<correction>'
    (b) push 'assertion' (voiced) + 'response' (direction + correction)
        entries to transcript
    (c) correction text → verbatim_log (source='correction')
    (d) pop queue head
    (e) refillAssertionQueue() refills in background

  PSYCH (planned, not yet built) — fires every 2 answered assertions:
    private set: state.psych_candidates: PotentialDilemma[] =
      { label, description, thoughts[] }
    op: 'add' new candidate OR 'append' thought to existing
    discipline: prefer appending; adding is for genuinely new territory
    thoughts must be evidence-anchored (cite warmth + verbatim entries)
    PSYCH knows run_idx + runs_remaining (calibration awareness)
    PSYCH OWNS the engagement read — can signal terminate=true when no
      candidate gains weight + user goes flat. closes the alienation seam.

  Terminates when:
    - voiced_count >= 6 AND queue empty (budget ceiling), OR
    - PSYCH signals terminate (no convergence + flat engagement)
  Then → Phase 4.

PHASE 4 — INTENTION (between hunt and close)
  User lands on intention input.
  In parallel: 4-5 intention-suggestion generators fire, each off one
    PSYCH candidate dilemma. Suggestions render as chips below the input
    (additive UI, no layout shift). Cheap (Sonnet?) freeform calls.
    Generator prompt orient: "include the details that make this
    question unmistakably theirs, leave out the rest" — relevance over
    strict dilemma-only.
  User picks a suggestion OR types own.
  The pick is the highest-quality disambiguation signal in the session.

PHASE 5 — COMPILE (compiler-as-sieve)
  Compiler now gets the user's INTENTION as primary filter input.
  Compiler's job: synthesize the Dilemma the user's intention is
    pointing at, drawing from PSYCH candidates + full transcript.

  Three resolution paths:
    (a) intent matches a PSYCH candidate → write that Dilemma in detail
    (b) intent is nonsense / placeholder → ignore literal text, pick
        the strongest PSYCH candidate (the "juiciest/best") and write it
    (c) intent reveals something PSYCH + detective MISSED entirely →
        create a NEW Dilemma from the intent text. trust the user's
        signal over the agents' coverage.

  Output is the Dilemma document — a filled template, not just a prose
    anchor. Includes:
      - the Dilemma (label, delta, fork-with-do-nothing-branch)
      - CRITICAL HYPOTHESES captured (load-bearing claims the seer needs)
      - flexible freeform regions for relevant detail / specifics /
        verbatim quotes
      - awareness flag (does the user seem to know?)
      - confidence + null-landing escape ("nothing resolved")

  Streaming Opus + extended thinking. Streams to ThinkingStreamView.

PHASE 6 — READING (out of scope here)
  Augur (intention-time outcome forecasts) → Seer engine constructed →
  cards laid → reading delivered.
```

---

## Active agents (sorted by phase)

| Agent | Phase | Tier | Pattern |
|---|---|---|---|
| SEEDER | 2 (pillars) | Haiku, freeform | Per pillar, parallel-after-submit, observations only |
| DETECTIVE | 3 (interrogation) | Opus, freeform | Background loop, 3-ahead lookahead, text-blob output |
| PSYCH | 3 (interrogation) | Haiku (planned) | Every 2 answered assertions, curates candidate set |
| INTENTION-SUGGESTOR | 4 (intention) | Sonnet (planned) | 4-5 parallel calls, one per PSYCH candidate |
| COMPILER | 5 (compile) | Opus + ext.thinking | Streams, once-per-session, sieve-shaped |
| AUGUR | 6 (reading) | Sonnet→Opus | unchanged legacy |

---

## Load-bearing principles (these survive all refactors)

- **Profile the problem, not the person.** Interior reads → suspicions
  fence; never quotable downstream. Dilemma = situation + fork, not a
  personality verdict.
- **WARM/COLD is absolute, not gradient.** COLD = eliminate a region,
  NEVER invert to the opposite. The detective + compiler both need this.
- **Corrections (user free-text) are the gold signal.** Above warmth,
  above seeder threads, above detective leading-hypothesis.
- **Re-listing as vote (organic).** Never tell the agent the counter
  exists. Pure signal from natural behavior, not actions taken to
  satisfy a mechanic.
- **Interrogation supersedes seeder calibration.** Seeder runs in
  Phase 2 only — pre-hunt. When seeder threads disagree with the
  warm/cold map, the warm/cold map wins (it's later, tested).
- **Detective's leading hypothesis is advisory, not binding.** The
  hunter wanting something to be true is not evidence it is.
- **Engagement read closes the alienation seam.** Phase 3 can't only
  terminate on budget. PSYCH owns the early-out.
- **Compiler creates the Dilemma in light of the user's intention.**
  It is the sieve. The user's intention is the final filter — and a
  passionate intent that the agents missed CAN override the entire
  candidate set.
- **Never manufacture.** Null-landing is a valid terminal state. Better
  to ship "no Dilemma resolved" than to invent one.

---

## What's still TODO (high-signal)

1. PSYCH agent — task #27
2. PSYCH-owned engagement early-out — task #28
3. Intention suggestions from PSYCH candidates (chips under intent
   input) — task #29
4. Compiler-as-sieve refactor — accept user_intention input, three
   resolution paths (match / juiciest / create-new), output the
   Dilemma document with critical_hypotheses captured. NEW TASK
   (supersedes the current compiler.md which is sieve-unaware).
5. Define Dilemma document schema — what fields the seer actually
   reads. NEW TASK.
6. Smoke test rig — fabricated Q&A → fire all agents → check parser
   hit rate.
7. ThinkingStreamView optionally subscribes to detective stream
   (deferrable).
8. Pipeline diagram update — task #30.
