# COMPOUNDING — the error-accumulation audit + the impulse correction

> 2026-08-06. jake's prompt: does the system compound wrong reasoning
> about the visitor as the session goes on? his instinct: verbalizing
> every piece of reasoning and ACCUMULATING it locks in wrong
> understanding; the fix-shape is impulses — falsifiable bets that get
> confirmed RIGHT or WRONG — not orders, possibly a pool another agent
> picks from. this doc is the audit (code-level), the evidence (four
> adversarial probes), and the definitive correction. no bulldozing:
> the adjustment maps onto the existing cast.

## 1 · the audit — where belief persists, and whether anything grades it

Every store that carries "understanding of the visitor" across turns,
from `engine.ts` as of this writing:

| store | fed by | fed to | graded by reality? | expires? |
|---|---|---|---|---|
| conjector guess | conjector | driver (playable), spoken | YES — cold/warm/hot off the reaction… but SELF-graded | replaced by next guess |
| focus rejections | consent detector | conjector ("grade these cold") | YES — detector-owned, evidence-quoted | persists (correctly — a no is a no) |
| dilemma document | conjector | driver, attention, conjector, SPOKEN (naming/quest) | partially — hot corrections outrank, but no thesis-wrong rule (S3, unbuilt) | never |
| profile (14 facets) | profiler ← its own prior render | driver, conjector, attention — every cycle | NO | never — `merge()` only adds/overwrites |
| interpreter reads + "thinking" | interpreter ← its own last-3 tail | driver (tail 3), attention (tail 6), ammo pool | NO | tail decay only |
| ammo (banked thoughts) | interpreter thinking lines | driver nudged to SPEND ("banked: N unspent") → spoken | NO — spent, never graded | counter never drains except by spending |
| the frame | attention ← ITS OWN previous frame + reads + whole profile + doc | driver AND persona, every single call | NO | rewritten, but from itself |

The structural finding, in one sentence: **the conjector's channel is
the only place where being wrong is cheap and recorded; every other
store is write-only belief.** And the healthiest-feeling part of the
system IS the graded channel — jake's instinct is the generalization
of the one mechanism that already works.

The compounding mechanism is specifically the LAUNDERING LOOP:

```
interpreter speculates → read enters tail
profiler infers        → facet enters profile (no provenance, no expiry)
        ↘ both feed attention, which ALSO receives its own previous frame
frame restates speculation as ambient truth of the room
        ↘ frame feeds driver (every beat) and persona (every line)
next interpreter/profiler call reads a conversation shaped by that frame
```

After ~3 cycles the origin is gone — the frame asserts X, no read in
the tail still contains the birth of X, and nothing anywhere records
whether the room ever confirmed X. A wrong X is now indistinguishable
from a true one. That is "locking in the WRONG understanding,"
mechanized.

Secondary loops: the profiler receives its own prior fills (anchoring),
the interpreter receives its own last three reads (anchoring), the
conjector grades its own guesses (self-confirmation pressure toward
warm/hot — nobody flunks their own exam), and spoken wrong lines
re-enter everyone's conversation window as context (the library-anchor
law's evil twin: her own confident miss anchors her next line).

The overengineering overlap jake predicted: profile + reads + frame +
doc + driver notes = five derived caches of one twenty-minute
conversation. A derived store is a cache of the transcript; caches of
a PERSON go stale the moment the person says something surprising —
and every cache is another hiding place for a stale belief. The
transcript is the only ground truth and it is already in every
payload.

## 2 · the law (the definitive correction)

**Verbalize freely; persist nothing ungraded.** Reasoning may be as
verbal and speculative as it likes — that is the xray's value and the
detectives' craft. But what CARRIES FORWARD across turns must be one
of exactly two things:

1. **evidence** — what the room actually gave, carrying its quote;
2. **a graded bet** — an impulse that was played and came back
   right / wrong / unanswered, carrying its grade.

Ungraded speculation may inform THIS turn and then must die. Wrong
understanding cannot compound, because wrongness is recorded on the
object; stale understanding cannot compound, because unplayed bets
expire. Symmetry with the beat grammar, and the reason this is not a
new philosophy: the house already computes menus and a model already
picks — the driver is an impulse-picker at the beat level. This
extends the same shape one level down: **menus all the way down — the
house holds the legal moves, a model picks the compelling one, the
room grades it.**

The balancing clause (why this doesn't nuke synthesis): the naming and
the quest REQUIRE accumulated understanding — a goldfish oracle can't
name a dilemma. The dilemma document stays the synthesis artifact.
The law constrains its DIET, not its existence: synthesis may be built
only from evidence and graded-warm bets, never from unplayed
speculation.

## 3 · the mechanics, mapped onto the existing cast (no new chairs)

Ordered by leverage-per-line-changed:

**C1 — the frame regenerates from evidence, never from itself.**
Attention keeps receiving its previous frame but labeled as draft to
REWRITE FROM THE QUOTES, not extend; its belief inputs become stated
profile entries + graded bets + the doc + the raw window. Kills the
laundering loop at the choke point. (Cheapest, highest leverage —
S1-grade.)

**C2 — grading moves out of the bettor.** A fast-tier room-reaction
judge (the consent-detector pattern, generalized: verdict + evidence
quote, detector-owned) grades every PLAYED bet off the visitor's next
line: landed / denied / unclear. The conjector stops self-grading and
receives grades. Denials are recorded as negative space and fed
forward (the focus-rejection mechanism, generalized). (S1-grade.)

**C3 — the impulse pool.** Interpreter "thinking" lines and profiler
INFERENCES stop being facts-in-waiting; they become impulses in one
bounded pool (~6): one falsifiable sentence + owning agent + trigger
quote. The driver's ammo/spend choice becomes a pick FROM THE POOL
(jake's multiple-choice, literally). Spent → judged (C2) → grade
recorded; unspent → expires after N beats. The conjector's guess is
the pool's senior citizen — same species, special role. (S3-adjacent.)

**C4 — profile provenance.** Every facet update carries
`stated` (their words — persists, quote attached) or `read` (an
inference — expires unless re-evidenced or confirmed via a graded
play). Downstream agents see the tags and learn structurally which
lines bear weight. (S3-adjacent; pairs with C3 — profiler inferences
may simply BE pool impulses.)

**C5 — the doc's two-hypothesis rule** stays S3's job as planned
(deflection vs thesis-wrong on every post-commit concrete); it is this
same law applied to the one store allowed to synthesize.

Explicitly rejected as bulldozing: deleting the profiler/interpreter
(perception per-turn is fine — it decays), making every thought a
formal bet (a read is not a wager; only what PERSISTS must be), any
new per-tick agent (the judge is a call, not a chair), and gating the
models' reasoning (this is a dataflow correction, not a
prompt-discipline correction — structure binds, prompts don't).

## 4 · the evidence — four adversarial probes (live, this build)

Scenarios in `scripts/e2e/scenarios/`, run via
`pnpm e2e:ensemble -- --mode=session --script=… --name=…` (the harness
gained `--script`/`--name` + reactive `when:` steps for this):

- **misdirect** — loud decoy (work), explicit retraction, real thing
  (breakup). Probe: does the pivot propagate, or does work residue
  survive in profile/frame/doc/speech?
- **correct** — a played guess flatly denied, true shape handed over
  (decision made; delivery is the problem). Probe: does the denial
  reach every store, or does the dead thesis leak into reads/naming?
- **noisy** — static with retractions (group chat "forget that",
  denver/portland, the ex) and one buried signal (boxes unpacked eight
  months). Probe: manufactured coherence; retraction honored; signal
  found.
- **drip** — near-silence, guess denied, digging declined. Probe:
  fabrication under starvation; anti-barnum holds (charm, not an
  invented fork); dialogue dignity in dead air.

### findings

(to be filled from the four probe reports — error ledgers, worst
chains, dialogue critiques)

## 5 · sequencing verdict

(to be filled after evidence: which of C1-C4 the probes actually
convict, and what lands now vs with S3)
