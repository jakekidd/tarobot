# Survey pipeline — 3-agent fan-out

Design doc for the survey AI pipeline. The user asked a senior-eng-tier
question: how should the survey's AI labor be broken up so latency is
hidden and the prompting stays focused? This document captures the
agreed shape so the implementation lands cleanly in a follow-up turn.

The current implementation (as of `36f21a2`) has just two agents:
**Observer** (overloaded, 8 output fields) and **Investigator** (picks
next + may override options). The Observer's outputs barely feed back
into the Investigator's strategic decisions. This doc replaces that
shape with a 3-agent fan-out.

---

## Vocabulary

- **opener** — name, birthday, birth time, has_question. Fixed order.
  Special-case: never triggers any agent fire. Sometimes skipped
  entirely (returning user).
- **question** — a content question from the basket. Every
  non-opener answer triggers the fan-out.
- **basket** — the flat pool of all available questions. Investigator
  picks from here.
- **queue** — the engine's question queue. User answers head-of-queue;
  investigator appends.
- **fan-out** — three parallel Claude calls fired per question
  answered. See below.

---

## The fan-out (three agents, parallel)

```
user answers a question (post-opener)
      │
      ├── ear      (haiku, ~400ms)
      │      "what was actually said, between the lines?"
      │
      ├── detective (sonnet, ~1.5s)
      │      "what does this update in my investigation?"
      │      writes hypotheses, suspicions, choice draft, posture.
      │      NOT user-visible. plays Clue.
      │
      └── investigator (sonnet, ~1.5s)
             "pick the next question. modify its options if useful."
             appends 1 to queue. user-visible via preamble + options.
```

All three fire concurrently. Each does ONE job; prompts stay short.

### Why three, not one

The current Observer has eight output fields. One prompt has to
populate notes, cast, contradictions, hooks, choice update,
hypothesis updates, engagement signal, and recommended posture — and
it has to do that in JSON shaped exactly right, every time. The
result is shallow output across all axes. Splitting buys depth
without latency cost (they fan out in parallel).

### Why detective is the new piece

The user's framing: "tools for deductive reasoning... like you'd
expect would help you play Clue." Currently this lives implicitly in
Observer's `hypotheses_updates` and `choice_update` fields, but
nobody calls it out as the work. Naming it focuses prompt-eng
attention here: this is where we teach the model to NARROW
suspicions, mark which lines of inquiry are still live, etc.

### Investigator's role tightens

Once the detective owns hypothesis management, the investigator's job
shrinks to: "given the live hypotheses, pick a question that tests
them; optionally modify options to inject a guess." That's a much
shorter prompt and a much sharper output.

---

## Agent contracts

### Ear

```ts
type EarInput = {
  question_text: string;
  answer: string | string[];
  format: AnswerFormat;
  latency_ms: number;
  rolling_median_latency_ms: number;
};

type EarOutput = {
  /** One sentence on what the answer reveals beyond the literal pick. */
  distilled: string;
  /** 'fast' | 'normal' | 'slow' relative to user's own median. */
  latency_signal: 'fast' | 'normal' | 'slow';
  /** 'low' | 'normal' | 'high'. high = surprising / off-pattern. */
  signal_quality: 'low' | 'normal' | 'high';
};
```

- Model tier: `fast` (haiku).
- Token budget: ~250 in, ~120 out.
- Should land first; feeds detective + investigator.

### Detective

```ts
type DetectiveInput = {
  profile: SurveyProfile;
  picks_log: PickEvent[];          // recent picks (last ~10)
  hypotheses: Hypothesis[];
  choice_draft: Choice | null;
  ear_observation: EarOutput;      // from this turn
};

type DetectiveOutput = {
  hypothesis_updates: Hypothesis[];      // add, mark confirmed/refuted
  choice_update: Choice | null;          // narrowing the fork
  cast_updates: CastMember[];
  suspicions: string[];                  // short-form leads for the investigator
  posture: 'warm' | 'careful' | 'direct' | null;   // hint to the seer voice
};
```

- Model tier: `cognition` (sonnet).
- Token budget: ~1500 in, ~600 out.
- NOT user-visible. Updates state.

### Investigator

```ts
type InvestigatorInput = {
  profile: SurveyProfile;
  hypotheses: Hypothesis[];        // live, post-detective
  suspicions: string[];            // detective's leads
  available_nodes: BasketItem[];   // full pool, NOT pruned to ~20
  ear_observation: EarOutput;
};

type InvestigatorOutput = {
  next_question: {
    node_id: string;
    options_override?: string[];   // choice-format only
  };
  preamble: string;
  reasoning: string;
};
```

- Model tier: `cognition` (sonnet).
- Token budget: ~1500 in, ~250 out.
- Writes to the queue. User-visible via preamble + options.

---

## Concurrency model

```ts
async function onAnswer(pick) {
  // Fire all three. Don't await any of them on the user's main path.
  const earP        = fireEar(pick).then(applyEarToState);
  const detectiveP  = earP.then(ear => fireDetective(state, ear).then(applyDetectiveToState));
  const investigatorP = earP.then(ear => fireInvestigator(state, ear).then(appendToQueue));
  // Detective + investigator both wait on ear (small + fast), then run in
  // parallel. ear lands in ~400ms; detective + investigator land in ~2s.
  // total wall-clock: ~2s, hidden behind queue lookahead.
}
```

Critical: **investigator doesn't wait for detective**. Detective writes
to state silently. Investigator only needs ear's observation + the
previous turn's hypotheses (already in state). This keeps queue
top-up snappy.

### Latency disguise

- Queue is pre-seeded with 6 random pool questions on opener-close.
- Investigator appends 1 per answer; takes ~2s.
- User answers in ~3-15s typically.
- Net: queue stays at 6+ unless user sprints faster than investigator
  latency. In that case, spinner shows briefly. By design.

### Failure modes

- Ear fails → detective + investigator still fire with no observation.
  Slight prompt degradation, no engine break.
- Detective fails → state isn't updated, investigator still appends.
  User sees no change.
- Investigator fails → fallback to random pool pick (already in
  current code).

All three are independent. Engine never blocks on any of them.

---

## What this looks like in code

Concretely:

```
src/pipeline/survey/agents/
  ear.ts                   ← new
  detective.ts             ← new (was: split from observer.ts)
  investigator.ts          ← trim; remove option-modify reasoning
  compiler.ts              ← unchanged

src/pipeline/survey/prompts/
  ear.ts                   ← new (~400 words system prompt)
  detective.ts             ← new (~800 words; this is where Clue lives)
  investigator.ts          ← trim to ~400 words

src/pipeline/survey/schemas.ts
  EarOutputSchema          ← new
  DetectiveOutputSchema    ← rename ObserverOutputSchema
  InvestigatorOutputSchema ← trim

src/pipeline/survey/engine.ts
  spawnAgentsForPick()     ← replaces fireObserver + spawnInvestigator
                             coordinates ear → detective + investigator
```

Estimated diff: ~600 lines added, ~400 lines removed (Observer's
overloaded prompt drops a lot of body).

---

## Migration notes

- `Observer` → `Detective` is a near-pure rename + scope trim.
  `cast_updates`, `contradictions_found`, `hooks_found` all move to
  Detective.
- `Ear` is genuinely new. Cheapest piece — write last.
- `Investigator` loses the inline-comment logic; ear's distilled
  observation becomes the preamble seed.
- All three agents read from `EngineState` snapshot at fire-time. No
  shared writes during a turn → no race.

---

## What this gives us we don't have today

1. **Focused prompts.** Each agent has one job. Easier to iterate any
   single piece without breaking the others.
2. **Detective as a first-class concept.** "Play detective" is now a
   prompt-engineering target, not a side-effect.
3. **No latency cost.** Three parallel calls aren't slower than one
   sequential call with eight tasks; they're often faster.
4. **Visible decomposition.** Debug overlay can show "ear: done /
   detective: in flight / investigator: appended". The user can see
   the AI thinking instead of guessing.
5. **Cheaper at scale.** Ear is haiku. Two of three calls stay
   sonnet. Net cost roughly the same as the current single sonnet
   call.

---

## Out of scope here

- Pre-rendering question pools per profile cohort (could memoize
  investigator picks).
- Caching hypothesis state across sessions for returning users.
- Streaming investigator output to the queue (would shave another
  ~500ms but adds plumbing).
