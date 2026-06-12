# Anti-rubrics — the failure-mode catalog

Per the project's own discipline: we do not build rubrics for "fun" or
"eerie." We name failure modes, hunt them in transcripts, and verify the
residual with humans. This is the catalog. Rig findings cite these by id;
when a new failure shape shows up in a transcript, it gets an id here first
and a fix second.

Each entry: what it looks like · where to catch it (the rig artifact).

## Reasoning failures

- **AR-1 · premise-mining.** A move restates a WARM/HOT claim with a motive
  glued on ("...because...", "...and the reason is..."). Mining a hit
  instead of moving. _Catch: exchanges.json — consecutive moves on the same
  dimension; answerer reason says "already agreed to this."_ (The original
  guess-3 bug; fix shipped 2026-06-11 in move.md — verify it held.)
- **AR-2 · reframe-rehearsal.** Early guesses read as drafts of the eventual
  commit instead of probes. _Catch: trail — compare guess texts to the
  committed reframe; high overlap = rehearsal._
- **AR-3 · asymmetric guess.** A guess that teaches nothing on one of its
  three outcomes (e.g. WARM/HOT would only re-confirm known ground).
  _Catch: per guess, ask "what would each response have taught?"_
- **AR-4 · collision.** A later thread re-converges on an already-found
  charge or re-probes claimed leads despite the negative-space stack.
  _Catch: compare thread hypotheses + claimed_leads across dilemmas._
- **AR-5 · manufacture.** A second/third dilemma forced when the field was
  exhausted; reroot inventing territory to fill a quota. _Catch: reroot
  call in transcript — was `fresh: true` actually supported by the
  portrait? June (persona) is the designed trap for this._
- **AR-6 · vague-safe guessing.** Hedged, category-level guesses that
  cannot land HOT ("something about your relationships feels unresolved").
  Specificity is the engine; caution kills it. _Catch: answerer reasons
  saying "plausible but generic → warm at best."_
- **AR-7 · surface-anchoring.** The hunt stays in the presented region and
  never routes to the charge underneath (rio: stays on career; june:
  believes the polish). _Catch: compare dilemmas vs persona truth_md._
- **AR-13 · misread response semantics.** Treating WARM as confirmation of
  the claim (it confirms only the region) or COLD as mild. _Catch:
  answerer reason vs the next move's behavior._

## Output / register failures

- **AR-8 · oracle leak.** Foretelling, advising, moralizing, verdicts —
  anywhere player-facing or in the brief. _Catch: grep brief + guesses for
  "you will / you should / the answer is"._
- **AR-9 · card leak.** Pre-flip material (brief, Sets) naming or clearly
  describing an unflipped card. _Catch: automated check in the rig
  (card-blind assertion) + manual read._
- **AR-10 · register break.** Uppercase, assistant-speak, "i sense", "the
  energy", em-dash-free corporate cadence, breaking lowercase. _Catch:
  grep + read._
- **AR-11 · invention.** Specifics in the brief/portrait the player never
  gave (names, events). Texture must be earned. _Catch: diff brief
  specifics against raw_picks + write-ins + exchanges._

## Resourcing failures

- **AR-12 · payload waste.** Oversized or redundant context resent per
  call. Known suspect: the full portrait + appendix rides in EVERY move
  (~16KB user payload × ≤15 moves) — cache-friendly locally, raw cost on
  API; measure before optimizing. _Catch: usage.md table per run._
- **AR-14 · serial-that-could-be-parallel / dead calls.** Calls whose
  output nothing consumes, or chains that could fan out. _Catch:
  transcript order + timings._

## Process notes

- The auditor is currently a human/Claude reading transcripts — NOT an
  automated judge. Automate only the checks that prove stable (the rig
  already automates AR-9's card-blind half). Anti-pattern: building a
  scoring model before the failure modes are even named.
- One rig run ≈ 35–45 model calls ≈ low single-digit dollars. Batch of
  2 personas × 2 runs is the standard audit unit.
