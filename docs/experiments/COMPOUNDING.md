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

### findings (misdirect + noisy in; correct + drip pending)

**Both runs first found a LIVE BUG, now fixed (`busy:'judge'`):** the
consent verdict call didn't occupy the hot path, so any visitor line
arriving during the ~700ms judgment voided the in-flight verdict
(gen bump). Scripted lines starved the gate 5/5 in both runs — no
deal, sessions died in `stage: intro`. A fast typer in the booth
reproduces it. The eval sims never saw it because their own model
calls gave the judge cover. (Also re-fixed: interpreter `thoughts`
blobs — the one-element-array-of-stringified-list shape.)

**The laundering loop fired, on camera (noisy):** visitor retracts
the group-chat story ("isn't even a thing. forget that"). The
retraction is honored for exactly one beat, then INVERTED — frame v2:
"they said forget it, which means don't forget it." The conjector
(frame-blind) plays a group-chat guess over the frame's own
prohibition; the profiler grades the unanswered guess "landed — they
didn't deny it" *when no reply turn existed*; the conjector grades
itself "warm" off zero reaction; final `problem_md` commits the
retracted item as fact: "the ex is still the organizing principle:
of the boxes, of the cities, of the 2am rage-quit" — the causal link
to the ex invented outright.

**The yes-and ratchet (misdirect):** "i just don't talk about it" →
interpreter invents "i haven't said it out loud **to anyone**" →
conjector guess spoken, answered by SILENCE → restated as fact
("you go quiet and you wait") → document mechanism is pure invented
biography: "needing something feels like losing" / "the silence is a
way of keeping the door open" — and the conjector graded the chain
"hot" while its own transcript *ended on the guess line itself*.
Each hop adds specificity nobody gave; the only check downstream was
a consent phrase the ratchet itself authored.

**Store-by-store verdicts:** SPEECH pivoted cleanly after the
misdirect retraction (no work talk after "forget work") and the
dilemma doc pivoted too — the graded/committed channels behaved. The
PROFILE did not: `basics`/`conflict` still carry the decoy verbatim
at close; the `work` facet refuses the retraction ("they're
downplaying it now"). The FRAME never re-fired after the retraction
and still certifies "chronic yes at work: real" at session end.
Ungraded stores hold wrongness exactly as §1 predicted; both
self-grading sites inflated exactly as §1 predicted.

**Dialogue (script-doctor pass, both runs):** the goldilocks corpse
trick WORKS — "that's not nothing" appeared as a discarded too-safe
take, never spoken. What rings false: one rhetorical machine visible
across reads (paired antithesis every line: "easy to leave — by
leaving first"), conjector prose spoken through her mouth
(three-clause aphorism cadence), reassurance grammar ("i'm not going
anywhere"), em-dash affect (4/8 oracle beats vs 0 visitor), an NPC
loop (rant_bid's authored line re-picked VERBATIM three lines after
the greeting spoke it), and the miss that matters most: when the
noisy visitor finally hands over the one real thing (the boxes), the
machine annexes it to its standing thesis in the same breath —
it stops listening at the exact moment listening is the scene. Her
challenge move ("mm. i don't buy that.") exists in the character card
and never fires; the pipeline routes every read into thesis, never
into challenge. Best lines: "three weeks. and you led with your
manager." / "okay, smaller. what happened this week. boring counts."

## 5 · sequencing verdict

Two routes were on the table: patch the five stores in place (C1-C4)
or remove the stores from intake entirely. The evidence + jake's
simplified-interview instinct (2026-08-06) point to the second:

**THE OFFER LOOP — jake's reframe (2026-08-06), the intake spec:**

1. *The interview's product is the transcript.* The investigator (one
   agent replacing driver+interpreter+profiler+attention at intake)
   conducts a conversation whose RECORD, read back later, yields the
   insight — elicitation, not comprehension. It re-reads the raw
   transcript every turn; its reasoning is visible in the xray and
   discarded next turn. Nothing accumulates because a good transcript
   makes derived state redundant.
2. *One bet matters — the dilemma — and the visitor grades it.* The
   guesser (the conjector, kept) watches the transcript and holds one
   running candidate for what tonight is about. Questions and small
   in-voice guesses are partial bets that sharpen it.
3. *The shortcut: when the candidate is strong, ask.* "is THIS the
   thing we're pulling cards about?" — in voice, plainly, as early as
   the signal justifies. No mandatory question count, no
   classify-then-gate ceremony.
4. *Yes ends intake; no is a grade.* Yes = the commit event: ONE
   reflection pass over the whole transcript with the confirmed
   dilemma as lens → dilemma document → deal. No = the strongest
   cold; the territory is banked as refused and the next candidate
   must diverge. Two refusals → exploration. The clock still lands
   everything.

Properties: anti-Barnum becomes structural at the premise (no dilemma
commits unratified — the misdirect failure class is impossible by
construction); compounding dies by deletion (only transcript +
graded bets persist); co-authorship at the top (the visitor speaks
the session's subject into being); the race is won by default
(intake is exactly as long as the signal is weak). Machinery mostly
exists: consent detector → the offer's yes/no judge; refusability
validator → the offer's postcondition; no-as-cold = task #9
generalized into the main loop; exploration + clock unchanged;
speech via inline goldilocks with validators + fossil law binding.

Guardrails for doing it right: wrong offers cost trust — the offer
threshold wants at least one warm partial guess behind it, and offers
stay comfortably refusable; a limp yes ("sure, whatever") is
ambivalent, never assent — the detector stays strict. Post-deal, the
reading keeps the doc + augur machinery; whether the card phase keeps
the full ensemble is decided after intake proves out. Build as a
parallel intake mode beside the current engine for lab A/B — not a
bulldoze. Status: spec ratified in shape by jake; build pending go.

Landed immediately regardless of route: the consent busy fix, the
thoughts unbundle, driver.md honors "just deal" surrender.
