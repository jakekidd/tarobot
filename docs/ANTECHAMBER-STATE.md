# Antechamber close-out — state of the turtle experience

**Point-in-time audit (2026-06-11), pre-Compiler-arc.** Every line below was
verified against the code on `main` (1413a80), not against intentions. When
this doc contradicts the code, the code wins. Delete this doc when the
Compiler arc ships and `docs/PIPELINE.md` absorbs whatever is still true.

Verdict up front: **the engine is done; the surfaces around it are the gaps.**
Survey → Scribe → Condenser → Conjector all ship and behave. What's missing is
festival-scope (queue, consent, Player persistence), polish-scope (latency
beats, post-hunt UX), and one real contract hole (the antechamber's output
bundle discards the Portrait).

---

## The checklist

✓ shipped · ~ partial · × missing

### Entry

| Item | State | Reality |
|---|---|---|
| Box Turtle Box Office (queue / tickets) | × | Festival-scope; needs a backend. Web MVP has menu → BEGIN. Correctly absent. |
| Universal Intake — name | ✓ | NameStep + live "i'm sensing… a NAME" dialogue; name + accent color, channel-free by design. |
| Universal Intake — age | ✓ | Birthday (last step) → `age_bracket`, sun sign, life path, birth card. Invalid date → astro null, survey still completes. |
| Universal Intake — vibe check | × | No warmth questions. The gag interlude serves the social role but carries no data. Defer. |
| Universal Intake — consent | ~ | Menu footer line exists but the copy is wrong: promises "sharing anonymous usage data" (nothing leaves the browser) and omits the AI acknowledgment. 1-line fix. |
| Player{} object | × | By design for web MVP. The analog is `RawPortrait.identity`. Nothing persists on the new path (Person records are legacy-path only). |
| Per-show routing | × | Single-show. Defer until a second show exists. |

### Survey

| Item | State | Reality |
|---|---|---|
| The Lineup — 14 facets, deterministic | ✓ | `IntroductionSurvey` rail walk. Fidelity rule holds (weight sorts, never drops). Per-facet `latency_ms` + `answered_at` captured. |
| Write-in box on every facet | ✓ | `ChatInput` "or type your own answer" → `free_text: true`, empty channels for the Scribe. |
| Scribe (write-in → channels) | ✓ | Haiku, one call per write-in, parallel, joined before the Condenser. Zod-validated JSON: indicators / implications / identities / hooks / notes / shadow / weight, calibrated against the facet's authored options. Failed enrichment → write-in rides through unenriched (not dropped). |
| Eager Scribe (fire during survey) | × | Deferred (backlog #4 in HANDOFF). Today it joins at close, adding latency under TuningLoading. |
| Mid-survey undo | ✓ | One-level undo, facets + birthdate, chevron in UI. Scribe unaffected (runs at close). |
| Intro framing | ✓ | Menu greeting → name → gag interlude ("do you mind if i ask…" false choice) → thanks copy that explicitly pitches the write-in. Intentional minimalism. |

### Condense

| Item | State | Reality |
|---|---|---|
| Condenser — RawPortrait → markdown Portrait | ✓ | One Sonnet freeform call (`cognition`, 1500 tok). Payload: identity (name / age_bracket / sun_sign / relationship_status) + per-facet channels (Scribe enrichments standing in for write-ins) + declined shadows. |
| Portrait structure | ✓ | Per `condenser.md`: Central leads (HIGH/MEDIUM/LOW/HUNCH tags) · Patterns · Tensions · Cast · Posture. |
| draftPortrait fallback | ✓ | Wired in `App.enterTuning` catch. Deterministic, can't realistically fail. Its fence line still says "Condenser not wired" — stale; it now means "Condenser failed." |
| Condenser latency cover | ~ | `TuningLoading`: static "mm. let me look at you a moment." Exists, single line, no reflection beat. |
| Known payload gaps (intentional today) | — | `hooks` channel omitted from the Condenser payload (authored-empty everywhere; revisit if hooks get authored). `life_path` / `birth_card` collected but unused downstream. |

### Hunt (Conjector)

| Item | State | Reality |
|---|---|---|
| Conjector naming everywhere | ✓ | Zero "Diviner" in new-path code/prompts. (One stale comment: `TuningLoading.tsx` says "hands off to the Diviner".) |
| Three ops: move / reroot / summary | ✓ | Zod contracts; Sonnet; budget context in every move payload. |
| Budgets: ≤5 moves/thread, ≤3 threads, ≤15 global | ✓ | `MOVES_PER_BRANCH` / `MAX_BRANCHES` / `GLOBAL_MOVE_BUDGET`. (3×5=15, so the global cap is belt-and-suspenders.) Forced commit on the last move via instruction. |
| COLD/WARM/HOT + YES/NO rails | ✓ | `temp` / `verdict` inputs; busy-guard ignores double-taps mid-flight. |
| Negative-space hypothesis stack | ✓ | Closed threads' hypotheses feed every later move (`already_found_search_elsewhere`) + the reroot. Claimed leads excluded from re-probing. |
| Per-thread first-person `summary_md` | ✓ | Includes a posture line for the seer per prompt. |
| Reroot may declare exhausted | ✓ | `fresh: false` → done. Never manufactures. |
| `deepen()` | ✓ stub | No-op with a TODO; commits the call-site/pipelining seam. No Compiler module exists behind it. |
| Latency cover between moves | × | Bare "…" Dialogue during `thinking` (~10s Sonnet calls). The known dead-air problem. |
| Confidence-tag strategy | × | `move.md` never mentions the HIGH/MED/LOW/HUNCH tags. The only steer is the code's default "(open — pick the hottest UNEXPLORED lead)". Probe-HIGH-first-for-trust, risk-LOW-later is unimplemented uplift. |

### Handoff

| Item | State | Reality |
|---|---|---|
| `ConjectorResult { dilemmas[] }` | ✓ | Each Dilemma: id, territory, reframe, confirmed, hypothesis, summary_md, claimed_leads, trail. Unranked, unversioned, no run metadata. |
| **The output bundle** | × | **The real contract hole.** The Compiler will need identity + Portrait + dilemmas; today `TuningDone` dumps only the dilemmas and the Portrait is discarded with the engine. You cannot correlate a hunt with the read it ran off after the fact. Fix before Compiler: an `AntechamberOutput` bundle { identity, portrait_md, dilemmas } threaded to the done screen. |
| Post-hunt player UX | × | `TuningDone` = dev JSON dump + copy + menu. No turtle close. Acceptable as the iteration surface; it is the dead end until the Compiler bridge. |

---

## Edge cases — verified actual behavior

- **Player NOs every reframe.** NO → re-probe/re-commit while budget lasts;
  budget spent → soft close. Dilemma ships `confirmed: false`, reframe = last
  NO'd commit. Every opened thread closes into a dilemma — NOs never produce
  an empty `dilemmas[]`.
- **Model never commits (disobeys the forced last move).** Soft close with
  `reframe: ''`. Handled, weak dilemma, no crash.
- **Thrown model call mid-hunt.** `run()` catches → phase `done` → whatever
  was banked ships. If the FIRST move throws: `{ dilemmas: [] }` →
  TuningDone renders "0 dilemmas". Graceful but **silent** — the error is
  swallowed; only the debug AgentActivity overlay saw why.
- **Walk away mid-hunt.** Nothing persists on the new path; exit/refresh
  discards the session. Listeners die with the component; no leak. No timeout
  exists (none needed for web MVP).
- **One dilemma only (exhausted on thread 1).** `dilemmas.length === 1`
  renders fine; nothing downstream to choke (there is no downstream).
- **Condenser fails AND draft fails.** Draft is pure string assembly — can't
  realistically throw. (Theoretical: if it did, the player would hang on
  TuningLoading; not worth defending.)
- **No API key.** Survey runs (no AI), dead-ends at the SurveyDone raw dump.
  By design.

---

## Telemetry / tuning loop

- Adapter reports per-call token usage to an `onUsage` callback — **no call
  site passes one.** Plumbing shipped, consumer missing.
- AgentActivity debug stream carries every call (system/user/response,
  ~2KB-truncated) — in-memory only, gone on refresh.
- The dilemma `trail` rides in the dump ✓; the Portrait does not ✗ (see
  contract hole above).
- The Pipeline page (topbar) still documents ONLY the legacy agents — no
  scribe/condenser/conjector rows. A lying surface for the new path.
- Survey captures per-facet answer latency ✓ (unused so far).

## Housekeeping discovered during audit

- **`main` is not lint-clean**: 4 errors + 1 warning, all in debug/lab
  surfaces (`AnchorView.tsx` ×2, `AgentDossier.tsx`, `ThinkingStreamView.tsx`
  — react-hooks rules). Predates this audit; typecheck and build are green.
  Fix before the next code push.
- Stale comments from the build churn: `TuningEngine.ts` header ("Condenser…
  still unwired"), `TuningLoading.tsx` ("the Diviner"), `draftPortrait` fence
  line, `SurveyDone` header, `App.enterTuning` ("drops that write-in").

---

## Close-out plan

**Quick fixes (≈1 hour each, do before Compiler arc):**
1. `AntechamberOutput` bundle { identity, portrait_md, dilemmas } → TuningDone
   dump (the contract hole + portrait-in-dump in one move).
2. Consent line reword (accurate: local-only processing, AI involved).
3. Stale-comment sweep (incl. draft fence line).
4. Wire `onUsage` → session token tally (console/debug bus).
5. Lint: fix the 4 debug/lab errors.

**Deferred (named, not blocking antechamber-done):**
- D1 · Reflection-beat latency cover (replace "…" with a pick shown back) — taste work, needs play.
- D2 · Confidence-tag strategy in `move.md` (HIGH-first trust building) — prompt work, needs live testing.
- D3 · Eager Scribe (enrich during survey) — orchestration.
- D4 · Post-hunt turtle goodbye → lands with the Compiler bridge.
- D5 · Pipeline page rows for scribe/condenser/conjector.
- D6 · Vibe-check questions; festival consent (A/V TTL); session timeout — festival arc.
- D7 · Box Office / queue / Player{} / persistence on the new path — festival arc (needs backend).
- D8 · Condenser cast split (only if Cast proves weak against real players).

**What blocks the Compiler arc: nothing hard.** Item 1 (the bundle) is the
only pre-req worth doing first — it defines what the Compiler consumes.
