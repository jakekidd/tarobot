# exp01 — the arms protocol (first run, 2026-07-07)

**Question.** Does the ensemble beat naive single-inference and the
single-voice baseline on the same material?

**Method.** Same brief (maya fixture), same scripted visitor track
(`scripts/experiments/lib.ts` MAYA_TRACK), session mode, 2 repeats per
arm. naive = one Sonnet call per beat, trimmed wildcard card + full
brief + full beats, ≤40 words. baseline = `src/pipeline/oracle`
OracleEngine as committed (its first live runs ever). ensemble = the
full build. Beats-only transcripts + audits in
`runs/experiments/exp01-a/`; shuffled blind bundle in
`runs/experiments/exp01-a/blind/` (mapping sealed) for human ranking.

**Metrics (means of 2 repeats).**

| arm | beats | w/beat | visitor share | name-tics | finished track |
|---|---|---|---|---|---|
| naive | 14 | 13.9 | 0.39 | 0 | yes |
| baseline | 11 | 13.4 | 0.41 | 0.27/beat | no — closed on flip 4 |
| ensemble | 13 | 22.1 | 0.30 | 0.08/beat | yes |

**Labeled qualitative read** (builder's bias acknowledged; the blind
rank is jake's):

- **naive is no strawman.** With a good character card and the brief in
  context it produced the single best line of the round ("you didn't
  need to hear it. you needed someone else to be in the room when you
  said it"). Its structural failures: it cannot hold (every event gets
  words — it double-speaks after flips and silences), and it
  paraphrase-leaks the mantra early because the mantra sits in its
  context every call.
- **baseline** carries the close-on-flip defect in its prompts (card 4
  never read, track never finished) and the every-beat name-tic. Its
  reads are competent but never card-specific.
- **ensemble** was the only arm that dressed the reading in the actual
  drawn card's imagery ("the staves are heavy and home keeps moving" —
  Ten of Wands): that is attention's dressings section working, and it
  is the clearest observable value of the machinery so far. Defects
  found: the close echoed an already-said line (fixed: fresh-line rule),
  and it talks ~60% more per beat than the other arms (see corrected
  hypothesis in README — economy curve, not carry).

**Verdict.** No winner declared — that requires the blind rank
(`runs/experiments/exp01-a/blind/`, 6 transcripts, A–F). The measurable
differentiators so far: ensemble uniquely does card-grounded reads and
event discipline (hold on silence, read on flip, close after the moment);
naive uniquely stays terse. If blind ranking favors naive's brevity, the
economy sweep (exp14) is the response, not despair: the ensemble's
advantages are structural, its verbosity is a slider.

**Repro.**

```
pnpm exp:arms -- --arms=naive --repeats=2 --out=exp01-b
pnpm exp:arms -- --arms=baseline --repeats=2 --out=exp01-b
pnpm exp:arms -- --arms=ensemble --repeats=1 --out=exp01-b   # ×2
pnpm exp:arms -- --bundle --out=exp01-b
```
