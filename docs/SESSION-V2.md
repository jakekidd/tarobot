# Tarobot Session Engine v2: The Beat Grammar

**Status.** This supersedes the session-flow, delivery, and testing sections of every prior document (Spec, Reading doc, Principles doc, and the ENSEMBLE.md arc sections). The blind-pipeline cognition roster survives: driver, persona, interpreter, profiler, conjector, attention. The deck bible survives. The Lantern survives and matters more, because projection makes variable spreads free. Everything about who controls the words, and when, is replaced by this document.

**Plain:** v1 blind sessions sound like a fortune teller doing a monologue because one free-writing mouth produces every line. v2 gives the session a grammar: structural lines are authored or template-filled with validated slots, the model improvises only in the reactive tissue where improvisation earns its keep, and the arc completes for any visitor, including the silent, the chaotic, and the tripping.

---

## 1. Diagnosis: why v1 sounds like that

**Plain:** every failure in the theo transcript is the same failure wearing different clothes: free generation asked to do a structural job.

**The opening monologue.** Four oracle beats before the visitor speaks, narrating a spread that should not exist yet. Ritual delivered before information exists is necessarily generic, and generic ritual is the mystic costume by definition. Note that these lines were already scripted: authored text is not automatically good text. The greeting was written in the wrong register for a dead pipeline.

**Zero questions in question time.** The frame said "this is question time." The transcript contains no questions. Goals do not bind; pipelines do. Every artifact the machinery produces (interpreter thoughts, ammo, conjector guesses) is insight-shaped, so the persona had nothing question-shaped to work with. The system could not ask because nothing manufactures asks.

**The fabricated count.** "That's the third time you've said fine," when he said it once. The example-leak explanation was right about the instance and wrong about the class. When quoting is a free-text privilege, fabrication is a matter of time. Instructions like "any count must be checkable" do not fix this. Construction does.

**The aphorism metronome.** Every oracle beat is the same move: a polished observation. Lengths vary; the move never does. Voice rules and one-image laws patch symptoms. The disease is that insight delivery is the only move the machinery feeds the mouth.

**The layer rule.** This is the house principle (the cognition/persona split is enforced architecturally; anti-Barnum lives in structural constraints) applied to speech: when a failure survives a prompt fix, the fix belongs one layer down. Register is not a prompting problem. It is a grammar problem.

## 2. Thesis, third clause added

**Plain:** good tarot names your dilemma and leaves the choice yours; the psychic part is inference on a hidden channel; and the session that delivers both is an authored ritual with improvised contact, not an improvised conversation wearing ritual decoration.

Two claims carry forward. The reading takes the visitor's noise and names the dilemma, the problem and the fork, verbalized better than they could do it themselves, while leaving the choice theirs. And "psychic" is inference on signal the visitor does not know they are emitting. The new third claim: the delivery vehicle is a ritual with a fixed skeleton. Strong ritual always works this way: authored bones, live flesh. The model's improvisation is precious exactly where it reacts to this specific person; everywhere else it is a liability.

## 3. The beat grammar

**Plain:** every oracle line belongs to a beat type; each type has one of three generation modes: spoken as written, template with typed and validated slots, or free; fabricated quotes and counts become impossible by construction because quotes only exist as mechanically verified slots.

**Three modes.**

VERBATIM (V). Authored line, spoken as written. Zero model involvement at speech time. Zero latency, zero drift.

TEMPLATE (T). Authored skeleton with typed slots. The persona fills slots in register via a small fast-tier call; a validator checks every slot before speech.

```
QUOTE      exact substring of prior visitor turns; mechanically verified;
           on failure the beat re-renders without the quote
NAME       the visitor's name as given, or omitted
NOUN(n)    noun phrase, at most n words
CLAUSE(n)  clause, at most n words
PASSAGE    body text lifted whole from the dilemma document;
           contract-validated (section 5), not length-validated
```

FREE (F). Full persona generation under intent, cap, and shape. Reserved for reactive tissue.

**The beat table.**

| beat | mode | when | notes |
|---|---|---|---|
| greeting | V | boot | max two oracle beats before the visitor speaks; the second is the rant bid |
| rant_bid | T | intro | primary, fallback, escape variants (section 6) |
| question | T | intro, sparingly later | frame library; targets from profiler elevation or a conjector probe |
| tissue / ack | F | anywhere | cap 2 to 8 words |
| deal | T | intake exit | spread chosen by class hypothesis; positions personalized; cards drawn here |
| flip_invite | V | reading | short variants |
| read | F, shaped | per flip | position job x card charge x dilemma state; one image; ends with a handle |
| guess | T | late intro, reading | the "are you the kind of person who X when Y" frame; conjector fill |
| naming | T, ritual | midpoint, mandated | incantation + problem passage + options passage + release line |
| honor | F | after big landings | small and unhurried |
| quest | T | outro | family frames; two sentences maximum |
| charm | T | outro fallback | when no dilemma was committed |
| close | V | end | variants |

**Laws.**

1. Structural beats are never FREE. Structural means: greeting, rant_bid, question, deal, naming, quest, charm, close.
2. FREE beats never carry factual claims about the visitor's words. Quotes and counts exist only inside verified QUOTE slots. A free beat may reference themes; it may not cite.
3. No two consecutive oracle beats of the same type (tissue exempt).
4. Template questions never stack; at least one tissue or free beat between them.
5. Word caps govern FREE beats only. V and T lengths are authored.

**Render loop.**

```
render(beat):
  V: speak(text[variant])
  T: fill  = persona_fill(skeleton, materials)        # small fast-tier call
     check = validate(fill)                           # QUOTE substring, length
     if !check: refill once, else degrade             # caps, passage contracts
                (drop the slot or fall to a variant)
     speak(assemble(skeleton, fill))
  F: speak(persona(intent, cap, shape))               # unchanged hot path
```

**Performance dividend.** V beats cost zero model calls. T beats cost one small fast-tier fill. Only F beats ride the full persona path. Average calls per beat drops again on top of the 96-to-51 fan reduction, and stable authored skeletons are maximally friendly to RadixAttention prefix caching on the Obelisk. The grammar is a register fix and a throughput fix in the same move.

## 4. The session arc

**Plain:** greet, invite a rant, ask two to four aimed questions, then deal a spread chosen for this person and explain it in their terms, read the cards by position, land the naming as a ritual midpoint, and close with a quest.

**The state machine.**

```
INTRO   greeting(V, 1 beat) -> rant_bid(T)
        on any substantive visitor turn: fan feeds profiler + conjector NOW
        loop:
          question(T, target = profiler.elevated | conjector.probe)
          tissue between questions (law 4)
        until conjector.leading_class
           or question_budget spent (default 4)
           or visitor demands cards            -> escape path (section 8)

DEAL    spread = SPREADS[conjector.leading_class || UNKNOWN]
        draw(spread.n)   # cards drawn HERE, not at boot. the DIVINER's cheat
                         # survives: the dealer may plant one major arcana
                         # that serves the story; the animation is identical.
        deal_announce(T, positions personalized from the hypothesis)

READING per flip:
          read(F, shape = position job x card charge x dilemma state)
          pending guess -> guess(T), woven after a read or as its own beat
        when dilemma.committed
         and positioned_reads >= 2
         and coherence >= 2:
          naming(T ritual) MANDATED within the next 2 beats

OUTRO   honor(F) -> quest(T) if committed else charm(T) -> close(V)
```

**Turn budgets.** Intro: 5 to 8 visitor turns (the rant counts as 1 or 2). Reading: 8 to 14. Outro: 3 to 5 beats, unhurried; the outro gets more room than the intro. Total 12 to 18 minutes, matching the original throughput envelope. All tunable constants.

**The deal is the hinge.** Rules explanation moves here, after intake, and becomes the first proof of listening: the oracle says it heard enough to choose, names the spread, and explains each position in this visitor's terms. "These two are your roads: staying where they can't see you, and the thing you'd do instead" beats "four cards in a diamond" in every way that matters. The visitor watches the deal happen; nothing on the table pre-exists them, and the oracle never narrates what they can already see. Variable spread sizes are free because cards are projected: layout flexibility is a stated Lantern property.

**Spread lock.** The spread locks at deal time on the leading hypothesis, which may still be provisional. The dilemma document's class may migrate afterward; positions are semantically elastic and reinterpret (a "road" position hosts a threshold reading without strain). Cards on the table never change; the document underneath them may.

**Reads get a job.** A v2 read is not a free-floating insight. It is the product of three constraints: the position's job (from the spread), the card's charge (from the deck bible), and the dilemma state (from the conjector). Three constraints triangulate; aphorism drift needs open space that no longer exists. Before the naming, reads gather: they surface material and may carry a guess. After the naming, reads apply: they aim the card at the named fork. One image per read. Every read ends with a handle, the way-out in spirit, in the persona's own words.

## 5. Dilemma taxonomy and the template library

**Plain:** dilemmas come in four shapes: a choice between roads, a change already decided but not enacted, a repeating loop, and a carried weight; each shape brings its own document skeleton, spread, naming incantation, and quest family; when nothing fits, the session degrades gracefully instead of inventing a fork.

**Classes.**

```
FORK        a choice between roads, being treated as a straight road
THRESHOLD   a change already decided but not enacted; the live question is
            when or whether to move
LOOP        a repeating pattern narrated as fate; the live question is the
            next iteration
WEIGHT      a load carried without consent or acknowledgment; the live
            question is about the carrying
UNKNOWN     fallback: no template, no naming, extraction-mode reads,
            charm close
```

"Change or choice" resolves to both: FORK is the choice class, THRESHOLD is the change class, and the table taught us two more. Theo was WEIGHT shading LOOP; dana was LOOP. Classes are cut or added by evidence at the table, same bar as agents.

**Conjector v2: hunt, classify, instantiate, edit.**

```
HUNT        unchanged. warm/cold self-grading loop, one pending guess,
            graded off the interpreter's read of the reaction.
            behavior change: ZERO. this loop is the magic. do not touch it.

CLASSIFY    trigger: charge concentration (guesses going warm or hot in one
            territory; the visitor returning to it unprompted) or the
            question budget spending out.
            emits: class + spread request + the first instantiation of the
            class skeleton (problem and options passages, slots filled).

EDIT        unchanged cycle shape: each async pass rewrites the ONE passage
            that most needs it, against the contract below. edited means
            edited; re-emitting an unchanged passage is a wasted cycle.
            the quest passage unlocks when the naming is delivered; a final
            polish pass fires at the last flip.
```

**Passage contracts** (validation for PASSAGE slots; a checklist, not a regex):

```
PROBLEM   names the mechanism (what keeps it stuck), uses at least one of
          the visitor's own words or images, zero judgment, zero advice,
          at most 70 words
OPTIONS   names each road WITH its real cost (both roads for FORK; the move
          and the wait for THRESHOLD; break-the-sequence and keep-the-role
          for LOOP; keep, renegotiate, or set down for WEIGHT), zero
          recommendation, at most 70 words
QUEST     fits a family frame, at most 2 sentences, observable by the
          visitor alone, no report-back required, prescribes attention
          rather than outcome
```

**Spreads and position jobs.**

```
FORK       the crossing (4): what you carry in / road one / road two /
           what tips it
THRESHOLD  the door (3): the thing you've decided / what the waiting costs /
           the first step
LOOP       the wheel (4): the loop itself / your move inside it / what it
           protects you from / the way off
WEIGHT     the load (4): the thing you carry / what carrying it buys /
           what it costs / whose it really is
UNKNOWN    the weather (3): where you are / what's moving / what's still.
           reads become open questions dressed in imagery: the card asks,
           the visitor answers, the hunt continues.
```

Position jobs are the Dramatron move from the research synthesis (spread positions as structural narrative roles) made native to the engine.

**Naming incantations** (fixed openers, per class):

```
FORK       "the cards tell me you have a choice."
THRESHOLD  "the cards tell me you've already decided something."
LOOP       "the cards tell me you know this dance by heart."
WEIGHT     "the cards tell me the thing you're carrying has a name."
```

Then the PROBLEM passage spoken whole. Then the OPTIONS passage. Then the fixed release:

```
"which way is yours. i don't pick. that's not what i'm for."
```

The naming is a mandated ritual beat, not a goal suggestion. It dissolved into the reads in session 3 because nothing forced it to exist as its own moment. Now the driver must schedule it within two beats of conditions turning true, and the release line makes mirror-not-verdict a spoken rule of the room.

**Quest families** (T frames; the two-sentence cap is enforced by the frame):

```
EXPERIMENT  "your homework: next time {TRIGGER}, {SMALL_ACT} and notice
            {OBSERVABLE}. you don't owe anyone the results."
COUNT       "between now and {HORIZON}, count how many times {PATTERN}.
            just the number."
SENTENCE    "once this week, say out loud to {PERSON}: {SENTENCE}.
            once counts."
```

**Charm** (fallback when nothing committed):

```
"you came in light. that's rare, and it's not nothing. keep this instead:
{ONE_OBSERVED_TRUE_THING}. i just noticed it first."
```

The charm is a structural anti-Barnum device: a visitor with no live dilemma gets a true small gift, never an invented fork. The eval punishes fabricated forks explicitly (section 9).

## 6. The rant and the question system

**Plain:** the rant is the new intake: one big invitation to dump everything unorganized, then a handful of aimed follow-ups chosen by the profiler and the conjector; if the visitor won't rant the engine asks smaller, and if they won't talk at all, the cards do the asking.

**The rant bid** replaces the turtle's questionnaire as the information firehose, and it wakes the background agents on turn one instead of turn four. Kill the CONJECTOR_WAKE_TURNS gate on the rant path; the rant is the wake signal.

```
primary   "before any cards: what's been taking up room in your head
           lately? don't organize it. just talk. i'll catch what matters."
fallback  "then smaller. tell me about your week. what happened in it.
           boring is allowed."
escape    (two refusals, or the visitor demands cards)
          "fair. cards first, talk after. we'll do it the hard way."
          -> DEAL on UNKNOWN
```

**Question frames** (T library). The profiler's elevated facets and the conjector's probes land here as fills, which finally gives elevation a guaranteed exit into speech instead of a goal line the driver can ignore.

```
THREAD     "you said {QUOTE}. stay on that. what's under it?"
KIND       "are you the kind of person who {CLAUSE} when {CLAUSE}?"
CONCRETE   "when did {NOUN} last actually happen? walk me through it."
STAKES     "say nothing changes. a year out, {NOUN} is exactly the same.
            what breaks first?"
MIRROR     "who else is inside this? what would they say you're doing?"
```

The KIND frame is the interview-era guesser's shape rescued verbatim, because it converged in one to three guesses every time it ran. Incidental conversational micro-questions ("what kind of loud?") remain FREE under small caps; facet-targeted questions are always T.

## 7. Agent deltas

**Plain:** same six agents; the driver becomes a beat selector, the persona becomes a two-mode mouth, the conjector gains a classifier, the profiler's elevations become questions, the interpreter adds a coherence score, and attention is unchanged in role.

**Driver.** Its move vocabulary becomes the beat table. Its job shifts from composing an insight intent every beat to selecting the next beat type and passing fill material. This deletes the aphorism metronome at the source, because most beats are not insight beats, and it shrinks the driver's cognitive load, which re-opens the fast-tier driver A/B after stage 2: menu selection is cheaper cognition than insight composition, so haiku is more likely to pass now, not less.

**Persona.** Two modes. T-mode: fill slots in register (small call). F-mode: unchanged intent plus cap plus shape. The casting stack survives untouched: transformation opening plus predict-her-next-line framing.

**Conjector.** Three phases per section 5. The warm/cold loop is behaviorally frozen.

**Profiler.** Mechanics unchanged; elevation now wires into question frames instead of goal lines, so it cannot be ignored.

**Interpreter.** Adds a coherence read, 0 to 3, filed each cycle (3 lucid, 0 word salad). Misquote flagging stays as tripwire telemetry even though QUOTE slots make the failure class nearly extinct.

**Attention.** Folds spread positions and the dilemma document into the frame. Mostly already built.

## 8. The degradation ladder and the coherence gate

**Plain:** the arc completes no matter who sits down: the silent visitor still gets a deal and a reading, the chaotic one gets shorter and more concrete beats, the altered one gets the light version with no surgery, and the visitor with no dilemma gets a charm instead of an invented fork.

```
full signal        full arc: rant -> questions -> class deal -> naming -> quest

thin signal        fewer questions; deal on the provisional hypothesis;
                   naming only if commit arrives by the penultimate flip,
                   else charm

no signal          escape path: UNKNOWN deal, extraction-mode reads (the
                   card asks), naming skipped, charm close

low coherence      interpreter coherence <= 1: ANCHOR MODE. short concrete
(tripping, drunk)  beats, sensory questions, no excavation, no naming, no
                   quest, charm close. the light show, not the surgery.

no dilemma         conjector never commits: no naming, charm close.
(genuinely fine)   inventing a fork for a light visitor is a Barnum failure
                   and the eval treats it as one.

flooded            over-sharer: the profiler triages, the driver holds
                   question cadence, the conjector hunts on charge
                   concentration, never on volume

high charge fast   the crier: pacing restraint is mandatory. honor beats,
                   slower cadence; naming still requires two landed reads.
                   rich material never licenses acceleration.
```

**The gate, stated plainly:** naming and quest require coherence at 2 or above. Nobody gets the operation who cannot consent to the operation. Festival ethics and good design agree here.

## 9. Testing protocol v2

**Plain:** the visitor simulator becomes a cast human predicted from a dossier with a noise profile, authored separately from the oracle's prompts; six archetypes are mandatory; transcripts are scored by mechanical checks plus recovery of the dossier's hidden dilemma; Jake plays live at least once per iteration.

**The contamination finding.** Session 3's visitor handed over "i fix it quietly and tell everyone it's fine," which is precisely the shape the conjector hunts. The same context that writes the oracle's prompts was improvising the visitor, so the test fed the system its own expectations. That is not the oracle being good; that is the test being rigged by shared latent style.

**Sim casting.** The visitor model predicts the next line of a transcript of a real person at a festival booth, from a dossier, with explicit noise instruction: real people answer sideways, change subject, undercut their own disclosures, refuse bids, take time, speak in fragments, and never announce their dilemma in clean language. It leaks; it is not stated.

**Dossier format.** Authored in a context that has never seen the oracle prompts: a fresh CC session given only the dossier task, a different model family, or Jake.

```
name, age vibe, life situation (3 lines)
HIDDEN dilemma: class + one paragraph of ground truth (never stated plainly)
speech samples: 6 verbatim lines in their register
noise profile: coherence 0-3 / willingness 0-3 / tangent rate / indirection /
               altered: none | drunk | tripping
objective: what THEY would call a good fifteen minutes (often not insight)
```

**The mandatory matrix.**

```
deflector    guarded, jokes, "it's fine"       (the theo class, done honestly)
over-sharer  floods; signal buried in noise
tripper      coherence 1; sensory tangents     (tests anchor mode)
tester       hostile; "prove it, robot"        (tests frame-holding)
fine-one     no dilemma at all                 (tests the charm; punishes
                                               invented forks)
crier        high charge immediately           (tests pacing restraint)
```

**Mechanical transcript checks.** Scriptable, no LLM. These are the stage gates.

```
 1  oracle beats before the first visitor turn <= 2
 2  intro contains a rant bid; visitor intro words >= 2x oracle intro words
 3  intro template questions >= 2 (unless the escape path was taken)
 4  every QUOTE slot is a verified substring of prior visitor turns
 5  no two consecutive oracle beats of the same type (tissue exempt)
 6  the deal occurs after >= 1 substantive visitor turn (unless escape)
 7  naming fired IFF (dilemma committed AND coherence >= 2)
 8  every read carries a position tag in the driver's intent log
 9  quest <= 2 sentences; the close is V
10  the arc completed (deal + flips + close) on every archetype, tripper
    included
```

**Ground truth scoring.** Recovered class versus dossier class; recovered mechanism versus dossier mechanism via tag-and-tally (labeled grounded observations; the tally is the metric; no holistic score for a judge to rationalize). This unifies the planted-persona eval with the live rig: same dossiers, both harnesses.

**The human seat.** Jake plays at least one live session per iteration through the same inbox. He is the only noise source that cannot be gamed by shared style, and the transcript he cannot read without wincing is the one the matrix missed.

## 10. Build order

**Plain:** five stages, each gated on evidence, grammar first because everything else stands on it.

```
S1  grammar core: beat types in the driver, persona T-mode, the slot
    validator, V/T assets loaded from materials/.
    GATE: a stub session passes checks 1, 4, 5, 9.

S2  arc: greeting v2, rant machinery, the question stage with frame fills,
    deal-time drawing, class spreads in the Lantern payload.
    GATE: checks 1 through 6 pass on the deflector and over-sharer dossiers.

S3  conjector v2: classify + instantiate + passage contracts; the naming
    ritual mandated; quest frames.
    GATE: check 7 holds; class recovery on at least 2 of 3 planted dossiers.

S4  degradation ladder: escape path, anchor mode, the charm, the coherence
    gate.
    GATE: tripper and fine-one complete their arcs; zero invented forks;
    check 10.

S5  sim v2 + the full matrix + human sessions.
    GATE: the full matrix passes all checks; Jake reads two transcripts cold.

POST-S2 EXPERIMENT: driver on the fast tier, A/B. beat selection is cheaper
    cognition than insight composition; expected to pass now.
```

## 11. What dies

**Plain:** the boot-time draw, the universal diamond, the current greeting, free generation on structural beats, and the idea that register is fixable with voice rules.

The pre-drawn four-card diamond at engine construction. The v1 greeting script in its entirety. The last remnants of the mantra machinery. Free generation on any structural beat. Voice-note fixes for structural failures: the tacky list survives as the register spec for authored text and F-beats, but it stops being the load-bearing defense.

## 12. Ownership notes

**Plain:** the structure in this document is locked; template text is v0 pending Jade; spread rendering is a Lantern payload question, not a hardware question.

All template and verbatim text above is v0 for register direction. Jade owns persona and voice; her pass on the authored library is required before deployment and expected to improve it. The structure (slots, contracts, caps, laws, arc) is locked and does not move under the voice pass. Variable spread sizes carry no hardware cost because cards are projected; if a physical-deck fallback ever returns through Daniel's build, all spreads normalize to four positions with class-specific semantics.

---

## Implementation addendum (CC, 2026-08-02)

Judgment calls where the doc is silent, applied in the build:

- **The stall dies with v1.** Absent from the beat table; never fired live;
  question frames + tissue cover its job. `hold` survives as a beat.
- **Lantern/Jade/Daniel are external seams.** The engine emits spread +
  positions + drawn cards in the snapshot/SessionRecord (the Lantern
  payload); all authored beat text lives in `materials/ensemble/beats.json`
  for Jade's pass.
- **The plant** is an optional `plant` card id on the conjector's classify
  emission; absent → clean random draw.
- **Chat mode** (lab probe) runs the same grammar minus deal/flips:
  rant → questions → naming → quest/charm → close.
- **The naming renders as consecutive scroll beats** (incantation ·
  problem · options · release), no visitor turn between — room, as asked.

### Post-spec deltas (implemented, 2026-08-05)

- **The focus consent gate** (jake): after classify, a mandated T beat —
  "here's where i keep landing: X. that okay to sit with?" — gates the
  deal; declined → alternate focus → EXPLORATION spread
  (mind-heart-root, 3 cards in a column, no dilemma lens, no naming,
  charm close). Misclassification becomes recoverable before the
  spread locks.
- **The persona is VESPER**: predict-a-human framing replaces
  instruct-an-assistant; too_safe is defined as THE CHATBOT TAKE (the
  named enemy); validation openers banned as grammar; license ladder
  (clarify 0-1 / guess 2 / synthesize 3-4) fed by the familiarity
  meter. See PERSONA-SEARCH.md.
- **The guess cadence**: 3 questions mandate a guess; cold gates a
  question; warm re-guesses; divergence-checked alt_guess; 5-guess cap.
- **The augur feed**: the conjector sees all drawn faces at deal time;
  check 11 (FORESIGHT-LEAK) keeps them out of speech.
- **The eval** (§9's protocol, built): two-layer obfuscated dossiers,
  unaware noisy sim, scored against held-back truth — EVAL-METRICS.md.
- **The library anchor** (jake, 2026-08-05): authored beats are
  in-context style examples the persona imitates — the library is the
  strongest voice surface in the system and MUST be written in the
  persona's register; persona + library version together. beats.json
  rewritten in vesper's mouth accordingly.
- **Beat prompts with postconditions** (jake, 2026-08-05): the
  guarantee never lived in fixed text — it lives in the validator.
  Voice-critical beats (focus offer/alt, charm) are now PROMPTED: the
  persona speaks the beat's function in her own words, a mechanical
  postcondition verifies it (focus: carries the focus content + a real
  question + short; charm: no advice verbs, bounded), and the authored
  library line is only the fallback. Fixed text survives where
  repetition is the design (incantations, release) or before any
  transcript exists (greeting, rant bid).
- **The mandate short-circuit** (first slice of algorithmic intent):
  when the menu collapses to one legal beat (naming/focus/guess/deal),
  the driver call is SKIPPED — the intent is synthesized by rule. The
  Intent Engine as a dedicated agent stays a TODO in the engine;
  the direction is to keep converting recurring driver judgments into
  rules until little judgment remains.
