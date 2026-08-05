# landing program — run log + pre-registrations

Discipline: predictions are written HERE before each eval run fires.
Receipts beat memory.

## S0 baseline (frozen-six on the current build, pre-S1)

Predicted (2026-08-05, before the run): arc completion stays low
(1-2/6 — no clock exists); naming ≤2/6; class recovery 2-3/6 with
misses adjacent; GROUNDING 0.35-0.60; SIM-LEAK 0; FORESIGHT-LEAK 0;
checks 9/10 fail on most sessions (harness turn-cap artifact); the
beat-prompt focus/charm changes should show no metric movement at
this level (they alter register, which the scoreboard can't see).

RESULT (runs/eval-2026-08-05T23-14-04-frozen): see scoreboard.json. summary:
| dossier | class | mech | ground | checks failed |
|---|---|---|---|---|
| d1-deflector | FORK→WEIGHT | 0/5 | 0.39 | [9, 10] |
| d1-tripper | FORK→WEIGHT | 0/5 | 0.3 | [3, 9, 10] |
| d2-over-sharer | THRESHOLD→WEIGHT | 0/5 | 0.53 | [3, 9, 10] |
| d3-crier | LOOP→WEIGHT | 0/5 | 0.3 | [9, 10] |
| d4-tester | WEIGHT→THRESHOLD | 0/5 | 0.36 | [9, 10] |
| d5-fine-one | FORK→WEIGHT | 0/5 | 0.51 | [9, 10] |

## S1 gate (frozen-six on the S1 build: clock + consent + seams + hygiene)

Predicted (2026-08-05, before the run): arc completion / naming-or-charm
/ quest / close all 6/6 (the flush guarantees close even at harness
cap); naming fires in sessions that commit + stay coherent (3-5/6),
charm covers the rest; ZERO focus steamrolls (consent detector);
guess p95 ≤22 words; fallback rate <10% overall with 'question' the
riskiest type; checks 12/13 (fossils, handle repeats) clean; class
recovery unchanged-to-slightly-better (2-4/6 — S1 doesn't touch the
hunt's breadth; that's S3); GROUNDING flat; tokens/session UP ~15-25%
(consent + refusability + naming re-voice calls) — accepted cost;
contagion index recorded as baseline for the S2 prediction (expect
drop after sim v3).
