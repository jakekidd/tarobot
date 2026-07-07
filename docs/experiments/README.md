# ensemble experiments — index

Numbered per the backlog in `docs/ENSEMBLE.md` §8. Raw artifacts land in
`runs/experiments/` (gitignored); these files hold the curated findings.
Scripts live in `scripts/experiments/` (`pnpm exp:audit`, `pnpm exp:arms`,
`pnpm exp:stall`).

| exp | title | status | finding in one line |
|---|---|---|---|
| 01 | arms protocol | run once (2×3 arms); blind bundle awaiting jake | ensemble is the only arm that dresses insights in card imagery; naive is NO strawman; baseline still closes on the flip |
| 04 | stall stress | run (starved fan) | zero stalls even with cognition fully starved — staleness was invisible to the driver; visibility note added |
| 12 | anti-rubric audit | running continuously over all sessions | caught + fixed the name-tic; caught the close-echo repeat; advice/verdict/card-naming ≈ 0 across all runs |
| — | cassandra calibration (preliminary, pooled) | 31 judged predictions | her confidence is REAL signal: 59% hit-or-graze at c3 vs 22% at c2 |

Fixes that came out of this round (all shipped): name only rides the
first/last persona beats; carry keys on absolute visitor underfeeding
(share-carry was a feedback loop); STALL_STATE says out loud when
cognition hasn't digested the newest material; close must not reuse an
already-said line; FactsSchema/beholder discipline (from the live-run
round).

Corrected hypothesis, for honesty: seer verbosity (w/beat ~21 vs naive's
~13) was NOT carry-driven — the fix didn't move it. It is budget-curve
driven (FILL_K × ~15-word visitor lines + FLIP_FILL keep the cap high).
The lever is an economy sweep (proposed exp14), not carry.
