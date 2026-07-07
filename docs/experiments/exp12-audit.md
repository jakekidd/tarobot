# exp12 — anti-rubric audit over recorded sessions (continuous)

**What it is.** `pnpm exp:audit` — free, no API. Reads every
`runs/ensemble-*/session.json`, computes per-run metrics (words/beat,
visitor share, name-tics, advice/verdict hits, double questions, card
naming, consecutive self-repeats), dumps moves histograms, stall/ammo/
bit counts, and pooled cassandra calibration. Run it after any batch of
sessions; curate discoveries here.

**Findings so far (2026-07-07, 8 live sessions):**

- **name-tic — found, fixed, verified.** The persona assignment carried
  "their name: maya" every beat; tic rate climbed run-over-run to 14/14
  seer beats. The chat run (no name passed) had zero. Fix: name rides
  only the opening and close, with "use it sparingly". Post-fix run:
  2/13 (the opening and the close, as designed).
- **close-echo repeat — found, patched.** ~1 per run: the close reused
  the previous beat's line nearly verbatim before the mantra. The
  `repeats` metric now watches it; the wildcard close rule demands a
  fresh line. Keep watching.
- **register holds.** Across ~90 seer beats: advice/verdict/prediction
  regex hits ≈ 1 (borderline), double questions 0, card named outright 0.
  The membrane's core promise is being kept.
- **ammo is not rare.** The driver passes ammo on nearly every beat
  (6–12 per session) despite "only when exactly right". Either the rule
  is wrong or the driver is greedy — exp06 (ammo efficacy) decides
  which; do not tighten the prompt before measuring.
- **joker files almost every fan** (5–10 bits/session) despite "nothing
  funny = file nothing", and bits are rarely observably played. Channel
  value unknown; candidate for a leave-one-out ablation.
- **cassandra calibration (pooled, n=31 judged):** confidence 3 → 59%
  hit-or-graze; confidence 2 → 22%. Her self-assessed confidence is
  real signal even while absolute hit rate is modest. Promotion gate
  (speculative pre-drafting) says ~40% sustained: c3 alone clears it,
  pooled does not. Keep accumulating before deciding.
- **verbosity:** ensemble w/beat ~21 vs naive ~13. Not carry (fix
  landed, number unmoved) — the budget fill curve keeps the cap high
  against ~15-word visitor lines. Proposed exp14: economy sweep
  (FILL_K × CAP_MAX × FLIP_FILL grid) against blind preference.
