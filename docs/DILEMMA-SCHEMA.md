# Dilemma document — the artifact the seer reads

Companion to `docs/PIPELINE.md`. Defines the structured artifact the
**compiler** produces at survey close (Phase 5) and the **seer** consumes
when building the reading. Supersedes the prior prose `Subject Anchor`
template (`materials/templates/anchor.md`) and the prior compiler output
schema (`agents/compiler/schema.ts`).

The shift: the old anchor was *person-shaped* (7 sections of "who they
are"). The new Dilemma document is *problem-shaped* — the situation,
the fork, and the load-bearing claims the seer must hold. Profile the
PROBLEM, not the person.

---

## Top-level shape

```ts
DilemmaDocument {
  // ── Provenance ─────────────────────────────────────────
  subject_name: string;                  // echo (for the prose intro)
  doc_v: number;                         // echo of the engine's doc version
  resolution_path: ResolutionPath;       // how the compiler arrived here
  reasoning: string;                     // 1–2 sentences, engine logs only

  // ── The Dilemma (load-bearing core) ────────────────────
  label: string;                         // kebab-case slug, e.g. "leaving-a-good-job-as-guilt"
  delta_description: string;             // markdown prose, 2–4 sentences
  fork: {
    do_nothing_branch: string;           // explicit prose. ALWAYS named.
    alternative_branch: string;
  };
  awareness: 'aware' | 'partial' | 'unaware';
  confidence: 'low' | 'medium' | 'high';
  domain_tags: DomainTag[];              // [] when null-landing
  null_landing: boolean;                 // true = "no Dilemma resolved"

  // ── Critical hypotheses (the new load-bearing addition) ─
  critical_hypotheses: CriticalHypothesis[];

  // ── Freeform regions ───────────────────────────────────
  specifics: string;                     // markdown freeform — concrete details + verbatim citations
  holding: string;                       // one sentence: stance + texture (delivery affordance, not content)
  suspicions: string;                    // markdown freeform — FENCED (do_not_voice)
}
```

### Sub-shapes

```ts
CriticalHypothesis {
  claim: string;                         // load-bearing assertion the seer must hold
  evidence: string;                      // citations: warmth events + verbatim entries
                                         //   ("warm on assertion 3; entry 7 said 'I'm tired of pretending'")
  confidence: 'low' | 'medium' | 'high';
}

DomainTag =
  | 'work' | 'love' | 'belonging' | 'shelter'
  | 'family' | 'self' | 'mortality' | 'meaning';

ResolutionPath =
  | 'matched-candidate'      // intent matched a WEAVER candidate → write that Dilemma
  | 'strongest-candidate'    // intent was nonsense → fall back to juiciest WEAVER candidate
  | 'created-from-intent'    // intent revealed something agents missed → new Dilemma
  | 'null-landing';          // no Dilemma resolved; null_landing must also be true
```

---

## Field-by-field intent

### `label`
Kebab-case slug naming the Dilemma. Stable identifier for logs and
debug. Lowercase, hyphenated, no quotes. Examples: `leaving-a-good-job-
as-guilt`, `staying-for-fear-of-empty`, `loving-someone-on-the-way-out`.
NEVER reference a hypothesis id — the old hypothesis-list machinery is
gone.

`null` is NOT permitted here; if `null_landing === true`, use the slug
`no-dilemma-resolved`. Keeps the schema non-nullable for the seer.

### `delta_description`
The DELTA — where the subject sits now, where the reading is trying to
move them. 2–4 sentences of prose. This is the paragraph the seer reads
first to orient.

NEVER write "wound." NEVER assign a verdict. The delta is a situation,
not a personality verdict.

### `fork`
The two branches the user is standing between. The `do_nothing_branch`
is ALWAYS named explicitly — drift is a fork. The `alternative_branch`
is the road the reading is suggesting *might* be visible.

For reinforcement Dilemmas (where the do-nothing path is the GOOD one),
the alternative branch is "disturb a thing that works" — name the
quiet anxiety that brought them in anyway.

### `awareness`
- `aware` — the subject knows the fork is there. Reading affirms + forecasts.
- `partial` — they sense it; the reading deepens.
- `unaware` — the reading reveals.

This single bit drives delivery downstream, so it earns being structured
rather than inline prose.

### `confidence`
Honest assessment of how well the evidence supports this Dilemma.
Three buckets — keep it coarse. The seer reads `low` confidence as
"this is the best we have; lean on cards more than anchor"; `high`
as "this is the bedrock; cards illuminate angles on it."

### `domain_tags`
Which subject-matter neighborhoods the Dilemma touches. Multi-select;
order does not matter. Conspicuous absences are findings — a
community-vs-solitude Dilemma with zero `love` or `family` tag is
itself loud.

Empty array when `null_landing === true`.

### `null_landing`
Boolean explicit flag — not text-parsed from prose. When true, the
seer routes to a light-reading mode rather than building around a
Dilemma. The compiler-side prompt rule remains: "better to ship 'no
Dilemma resolved' than to invent one."

### `critical_hypotheses[]`
**The new load-bearing addition.** Replaces the implicit "leading
hypothesis" + "unsaid" sections. Each entry is a single claim the
seer should treat as load-bearing during the reading, with the
evidence that earned it.

These are the claims the seer wants to gently corroborate or surface
through the cards. Not personality verdicts — *structural claims about
the situation* the user is in.

Discipline:
- 0–5 entries. Zero is valid (rare; usually paired with low confidence).
- Each `claim` is ONE sentence; structural, not personal.
- Each `evidence` cites at least one anchored source — a warm/cold
  event on a specific assertion idx, or a verbatim entry index.
  No anchorless claims.
- Order does NOT carry weight. The seer reads them as a set.

Anti-pattern: a critical hypothesis that says "the subject is X-type
person." If you're tempted, restate as a situational claim ("the
subject is choosing to perform okayness in front of family") or drop.

### `specifics`
Markdown freeform region. Where the compiler weaves the concrete
details, verbatim citations, names, places, and sensory texture
relevant to the Dilemma. This is where the seer fishes for uncanny
callbacks.

Discipline:
- Reference the verbatim log by index ("entry 7 said 'preserves rest'")
  rather than paraphrasing.
- Only relevant specifics — not a kitchen sink dump.
- Names from `cast` are first-class; pronouns from cast carry.

### `holding`
ONE sentence. The subject's stance — cooperative / guarded / skeptical
/ grieving / content / testing / performing / honest — plus a short
texture beat. Delivery affordance, not content. Affects how the seer
should be in the room with them.

Example: `"performing okayness, but the latency-z on the body question
spiked — they're tired."`

### `suspicions`
Markdown freeform region. **FENCED** — `do_not_voice`. Low-confidence
guesses worth steering toward, never quotable downstream. The seer's
director may use these as leads; the actor MUST NOT reproduce them as
utterance.

Discipline:
- Hedge linguistically ("might be", "possibly", "the shape of X").
- One paragraph max.
- This is where the cop-sheet failure mode is most likely; keep tight.

### `resolution_path`
Provenance — which of the three sieve paths fired:
1. `matched-candidate` — intent landed on a WEAVER candidate; compiler
   wrote that one out in detail.
2. `strongest-candidate` — intent was thin/nonsense; compiler fell
   back to the juiciest WEAVER candidate.
3. `created-from-intent` — intent revealed territory WEAVER + detective
   missed; compiler built the Dilemma from the intent text. Trust the
   user's signal over the agents' coverage.
4. `null-landing` — paired with `null_landing === true`.

Engine logs this; debug panel surfaces it. Not seen by the seer.

### `reasoning`
1–2 sentences. Which thread won and why. Engine logs only — not seen
by the seer.

### `subject_name`, `doc_v`
Echoed straight back. `subject_name` is what the seer's prose intro
uses for the dedication line; `doc_v` is the staleness gate.

---

## What got cut (and why)

Compared to the prior 7-section anchor template:

- **"Unsaid"** → collapsed into `critical_hypotheses[]`. The gap between
  self-story and pattern is exactly what a critical hypothesis captures,
  but with evidence anchored, not free-floating.
- **"What They'd Say About Themselves"** → cut. Profile the PROBLEM,
  not the person. If the user's framing matters, it lives as evidence
  inside a critical_hypothesis or as a verbatim citation in `specifics`.
- **"Margin"** → cut. The compiler is not a scribbler; it's the sieve
  at close. Half-thoughts belong in the detective_thinking stream, not
  the artifact.
- **"Domain"** section → collapsed to `domain_tags[]` array. The prose
  paragraph was always either redundant with the Dilemma section or
  drifted into person-shape.

Sections kept (renamed / restructured):
- **"The Dilemma"** → `delta_description` + `fork` + `awareness` +
  `confidence` + `domain_tags` + `null_landing`
- **"How They're Holding It"** → `holding` (one sentence)
- **"Suspicions — DO NOT VOICE"** → `suspicions` (still fenced)

---

## Validation invariants

For any well-formed DilemmaDocument:

1. `fork.do_nothing_branch` is non-empty (always explicit).
2. If `null_landing === true`:
   - `confidence === 'low'`
   - `domain_tags === []`
   - `critical_hypotheses === []`
   - `label === 'no-dilemma-resolved'`
   - `resolution_path === 'null-landing'`
3. If `null_landing === false`:
   - `domain_tags.length >= 1`
   - `delta_description` is non-empty
   - `resolution_path !== 'null-landing'`
4. Every `CriticalHypothesis.evidence` references at least one anchor
   (regex-checked at parse: matches `entry \d+` OR `assertion \d+`
   OR `warm`/`cold` keyword + idx).
5. `suspicions` carries the `do_not_voice` discipline. Downstream
   consumers (seer prompts) MUST be aware this section is fenced.

The compiler retries once on validation failure, then null-lands.

---

## Seer-side consumption (forward-look)

When the seer is updated to read this artifact directly (post-Task #31):

- The **intro director** reads `delta_description`, `fork`,
  `awareness`, `holding` + the top 1–2 `critical_hypotheses` to build
  its opening Set.
- The **per-card director** reads the full `critical_hypotheses[]`
  set + `specifics` and uses them to choose which angle a card's slot
  meaning illuminates.
- The **closing director** reads `awareness` + the held swing queue
  (if any) for the final risky moment.
- The actor (across all tranches) NEVER sees `suspicions`. The director
  may steer toward them, the actor MUST NOT voice them.

This consumption pattern is the reason the schema is structured
fields rather than a single prose blob: it lets each director layer
pick the slice it actually needs.
