# Tarobot Survey

Tarot is about healing — about unraveling the stories we inevitably get
stuck telling ourselves, to uncover new meaning, perspective, growth,
and peace. This survey is the front-half of that ritual. Its job is to
help the reading land specifically rather than generically.

## Rules for use

This file is the source of truth for every question the survey can ask.
Edits here ship to production. Add a question by adding a new section
under the right topic, in the format the **Template** entries show.
Reorder by moving the section. Delete by deleting.

A few rules so the parser doesn't bite you:

- Each question is one `###` (or `####` inside Pool topics) section.
- The heading text IS the question — what the user reads. There is no
  separate ID. Internally the engine slugifies the heading to a stable
  string so it can track which questions have been asked across visits.
  If you change a question's heading text, the engine treats it as a
  new question — which is fine; it just won't dedupe against the older
  form on returning visits.
- The **first** entry under each section is labelled `Template`. The
  parser skips templates. They exist to show the schema.
- **Pillars** is the structural backbone. The questions here are asked
  in this order at the start of every survey (after name / birthday /
  intent, which live in code because they have special UI). Order
  matters. Move questions to reorder.
- **Pool** is the random pool. The engine draws N questions from here
  per first-time visit (currently 12; dedup'd 6 for returning visits).
  Order doesn't matter inside the pool.
- Fields per question:
  - `Format`: one of `choice` | `binary` | `matrix` | `fork` |
    `relationship_pick`. (Openers `text` / `date` / `intent` are
    code-only.)
  - `Probe`: a structured decoder hook (optional but encouraged). Lives
    as an indented block with three sub-fields the parser recognizes:
      - `Surface`: what the literal answer is about.
      - `Inversions`: what answers may invert to — the algorithmic
        seeder reads this to drop hypothesis seeds onto the detective's
        board.
      - `Watch for`: cross-history confirmations / complications.
    Legacy single-line `Probe: ...` still parses (stored as `surface`).
  - `Options`: bullet list of answer choices. Required for `choice`.
    `binary` ignores it (locked to yes / no / sometimes).
    `relationship_pick` ignores it (own UI).
    `fork` takes pairs in `left | right` format, one per bullet.
    Each option can be followed by `:: comment` — a short line shown
    inline after the user picks that answer.
  - `Axes`: required for `matrix`. Two pairs in `x: a | b` / `y: c | d`
    format.
- Substitution: `{name}`, `{sun_sign}`, `{birth_card}`, `{life_path}`,
  `{age_bracket}` get replaced with profile values at render time.
  Questions with required substitutions only render when the field is set.

---

## Pillars

The six always-asked questions, in fixed order. The arc moves from
external grounding (basics) inward through attachment activation and
somatic baseline, then through anchor and values, and lands on the
live fork as the climax.

Authoring note (v3.1 reorg): the pillars were reorganized around
discriminative axes — attachment activation, somatic baseline, and
contextual grounding (basics) replaced tarot fluency, spiritual
register, and mind/heart/gut decision-making. Six pillars total.
The cut-three / add-three math was deliberate; we kept the relational
anchor (now `center_of_life`, plural-picks-friendly), kept value_most
(added `belonging`), and kept the live fork as the closer. The
Cleo-detector role (true-empty / reinforcement case) moves into the
detective's null-routing signals — it's not a pillar question
anymore; the engine reads it from the absence-of-traction across the
content-level signals (signals.ts).

NOTE on `center_of_life`: the question authors as plural-friendly,
but the current RelationshipPickForm UI is single-pick only. Plural
picks (CastUnit) is a Phase 4+ UI follow-on tracked in REFACTOR-V3.md
§18. Until then, single-pick — users who would have picked plural
(family / partnership / chosen people / crew) will pick one
representative and we'll re-prompt later when plural lands.

### Template

Format: choice
Probe:
  Surface: a one-line note about what the literal answer is about.
  Inversions: what the answer may invert to / suspect (seeder reads this).
  Watch for: cross-history confirms or complicates this read.
Options:
  - first option
  - second option :: optional inline comment

### how are the basics right now? (e.g. housing, money, health)

Format: choice
Probe:
  Surface: life-stability prefix — what register the user is actually asking from. identity-questions administered at a survival-stage user read as luxury problems.
  Inversions: handled = stable platform candidate, the user came for meaning-work; mostly = some active strain, listen for which domain shows up in later answers; some are not = significant load, the reading should soften register and prioritize presence over insight; very little = survival-stage candidate, the agent should ask once whether real-world support is available before going deep.
  Watch for: "very little" + later "performing + not okay" answers = high mask + survival load. treat the entire reading as a chance to be witnessed rather than diagnosed.
Options:
  - handled
  - mostly
  - some are not
  - very little :: we'll come back to this.

### when someone you love goes quiet, you—

Format: choice
Probe:
  Surface: attachment activation under relational ambiguity.
  Inversions: reach out = anxious-leaning candidate, low tolerance for unread state in close bonds; wait = could be secure or avoidant — does not discriminate alone, needs cross-check from deep-tier relational items; assume the worst = high attachment-anxiety candidate, possible abandonment hypervigilance; let it go = avoidant-leaning candidate, or genuinely settled — does not discriminate alone.
  Watch for: cross-reference with pull-away-when (in pool) as the other anchor of the attachment axis. "assume the worst" + later "i need them" type answers on relational items = anxious-attachment + need-shame cluster. "let it go" + with-whom-unsaid pointing to a primary bond = avoidant-with-active-dampening pattern.
Options:
  - reach out
  - wait
  - assume the worst
  - let it go

### where do you live in your body, most of the time?

Format: matrix
Probe:
  Surface: somatic baseline crossed with interoceptive awareness — what state the nervous system sits in, and whether the user can feel it.
  Inversions: revved up = sympathetic-dominant baseline candidate, often chronic activation or anxiety; shut down = dorsal-vagal-dominant baseline candidate, often depression, exhaustion, or dissociation; aware = interoception intact, somatic probes will land downstream; not aware = low interoception, the reading should not lean on body-based language — pivot to cognitive or narrative framings.
  Watch for: "shut down + not aware" + "they don't notice" anxiety-presentation (in pool) = dissociative baseline candidate, name gently. "revved up + aware" + "fix it" distress-response (in pool) = hyperfunctioning-anxious candidate. anyone in shut-down should NOT be handed a "powerful insight" — they can't metabolize it. soften register and prefer reflection over revelation.
Axes:
  - x: revved up | shut down
  - y: aware of it | not
Options:
  - revved up + aware
  - revved up + not
  - shut down + aware :: that's a hard place to live from.
  - shut down + not

### who's the center of your life right now?

Format: relationship_pick
Probe:
  Surface: relational anchor. authored as plural-friendly (intended v3.1 design accepts plural picks like "my family", "my partnership as a unit", "my chosen people", "my crew"), but the current UI is single-pick only — users with a plural self-concept will pick one representative until plural-pick UI lands (REFACTOR-V3.md §18 backlog).
  Inversions: the user picks the central CastMember. absence or distance from later answers is data. picking "ex" or "someone i used to know" instead of a current bond is a tell about where the gravity actually is. when plural picks become available: picking a plural anchor when individuals were also offered is a tell that the self is collectivist-shaped or that no single individual carries the weight.
  Watch for: if this pick doesn't reappear in later relational answers, the bond is aspirational, strained, or under-functioning. if it reappears in shadow or insecurity contexts, the bond is conflicted. for plural picks (when supported): probe which member of the unit is most active right now.

### Which of these do you value most?

Format: choice
Probe:
  Surface: what they will sacrifice OTHERS for. abstract priorities collapse the rest of the survey through this lens.
  Inversions: strong values invert to corresponding fears — love → fear of being unlovable / abandoned; freedom → fear of constraint / entrapment; wisdom → fear of being foolish / deceived; beauty → fear of decay / irrelevance / invisibility; security → fear of chaos / things falling apart; power → fear of powerlessness / humiliation; belonging → fear of being cast out / not enough for the group. seed the inverted fear as tentative; later answers either confirm or complicate.
  Framing helper (DFW worship thesis — internal context for detective/profiler, NOT user-facing): everyone worships; the only choice is what. money worship → worth-output equation; intellect → rationalism as armor; beauty → fear of decay; power → fear of powerlessness; love → fear of being unlovable; freedom → fear of constraint; wisdom → fear of being foolish; security → fear of chaos; belonging → identity-as-membership, fear of exile. the user's pick is the altar.
  Watch for: this is the spine — read every later answer through this lens. a user who picks "belonging" plus a relational anchor that's plural-coded (when plural picks land) is collectivist-coded; do not treat "belonging" as a deficit value, treat it as a different motivational structure.
Options:
  - love
  - freedom
  - wisdom
  - beauty
  - security
  - belonging
  - power

### Which one is your question right now?

Format: fork
Probe:
  Surface: the live fork the user is standing inside — both side AND being stuck-between are diagnostic.
  Inversions: each pick seeds a specific suspicion. risk = there's a leap they keep not taking; hold = there's a leap they keep almost taking. stay = there's an exit they're not letting themselves see; go = there's a commitment they've already psychologically left. fit = there's a part of them their people don't know; break = they've broken out and aren't sure if it was worth it. continue = the trajectory is set but no longer chosen; change = mid-arc collapse of a previous identity. close = they wall up because someone got too close; open = someone is waiting at the wall. resist = the thing they're fighting may be themselves; accept = they've started surrendering, unsure if it's wisdom or giving up. control = systemic dread is masking a local choice; surrender = already-burned, looking for what's worth saving. later = they're about to do something irreversible; now = a window is closing they can feel but not name. silence = there's something specific being unsaid to a specific person; speak = they spoke up recently and aren't sure if it was right. bar (stuck-between) = the most diagnostically loaded — they're not committed to a side, the fork is acute.
  Watch for: if the user picks the bar (stuck-between), weight the fork as the SPINE of the reading. cross-reference with center_of_life (whose voice is on either side of this fork). a continue/change pick weights the vocational neighborhood; a close/open or fit/break pick weights the relational neighborhood.
Options:
  - risk | hold
  - stay | go
  - fit | break
  - continue | change
  - close | open
  - resist | accept
  - control | surrender
  - later | now
  - silence | speak

---

## Pool

Random draws live here. Group by category; the parser uses the category
heading (`### category-name`) to tag each question. Categories track the
9 the observer files under: `self`, `history`, `relationships`, `joys`,
`fears`, `insecurities`, `yearnings`, `now`, `tensions`. `tensions` is
observer-derived only — no questions are tagged with it.

### self

#### Template

Format: choice
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...
Options:
  - first option
  - second option

#### How do most people see you?

Format: choice
Probe:
  Surface: how the user thinks they read to others.
  Inversions: reliable = identity built on dependability; intense = aware they overwhelm; kind = wants kindness reflected back, may be people-pleasing; hard to read = cultivates opacity.
  Watch for: contrast with perceived_as pillar — match = stable self-image, mismatch = compensation pattern.
Options:
  - reliable
  - intense
  - kind
  - hard to read

#### And how would you describe yourself?

Format: choice
Probe:
  Surface: self-narrative tone.
  Inversions: "someone who tries" = effort as identity, may be exhausted; "someone tired" = unguarded, possibly recently arrived at this answer; "someone good" = either grounded or performing virtue; "someone working on it" = in motion, growth-oriented.
  Watch for: contrast with how-most-people-see-you for the gap.
Options:
  - someone who tries
  - someone tired
  - someone good
  - someone working on it

#### When things go wrong, first instinct?

Format: choice
Probe:
  Surface: blame-direction default.
  Inversions: "my fault" = internalizer, often perfectionist; "their fault" = externalizer, may have boundary issues either way; "nobody's fault" = either evolved or dissociated from agency; "i'll figure it out" = competence as defense.
  Watch for: cross with do-you-keep-score and pull-away-when.
Options:
  - it's my fault
  - it's their fault
  - it's nobody's fault
  - i'll figure it out

#### Do you keep score?

Format: choice
Probe:
  Surface: accounting of relational debt.
  Inversions: yes = tracks, often resentful; no = either generous or suppressing resentment that will surface as collapse; "only with the wrong people" = differentiates trust ranges, mature pattern.
  Watch for: "no" + later mentions of someone-specific = suppressed resentment toward that person.
Options:
  - yes
  - no :: either generous or suppressing resentment.
  - only with the wrong people

#### When did you last change your mind?

Format: choice
Probe:
  Surface: epistemic flexibility.
  Inversions: recently — about a person = in flux relationally, possibly post-rupture; recently — about myself = active self-revision, often post-shame or post-loss; long time ago = rigid or settled; afraid to look = either deeply stable or genuinely closed; "i've stopped checking" is the same valence.
  Watch for: "afraid to look" + "i've stopped checking" on perceived_as = strong rigid-pattern. "about myself" + the proudest+ashamed thing = current integration work.
Options:
  - recently — about a person
  - recently — about myself
  - a long time ago
  - afraid to look

#### Do you like yourself?

Format: choice
Probe:
  Surface: self-regard baseline.
  Inversions: "mostly" = grounded; "on good days" = mood-dependent self-image, suspect underlying anxiety/depression; "i'm trying to" = active negotiation, often post-shame; "not really" = unguarded admission, treat tenderly.
  Watch for: cross with do-most-people-see-you-as-kind — kind self-image + low self-regard is the classic care-giving wound.
Options:
  - mostly
  - on good days
  - i'm trying to
  - not really

#### What do you protect?

Format: choice
Probe:
  Surface: where the boundary energy goes.
  Inversions: "my time" = exhausted by demands, may be over-functioning; "my heart" = recently hurt or hiding old hurt; "a person" = someone vulnerable in the cast; "a story i tell about myself" = the deepest answer, points to identity-as-defense.
  Watch for: "a story i tell about myself" + perceived_as as the role i play = the role IS the story.
Options:
  - my time
  - my heart
  - a person
  - a story i tell about myself

#### Something's wrong. you—

Format: choice
Probe:
  Surface: distress-response default.
  Inversions: fix it = action-coper, may suppress affect; sit with it = tolerates discomfort, possibly trained by therapy or experience; ignore it = avoidant or genuinely resilient; talk to someone = relational regulator, suspect a trusted person in cast.
  Watch for: "fix it" + "my fault" first-instinct = perfectionism. "ignore it" + "i've stopped checking" perceived_as = dissociation.
Options:
  - fix it
  - sit with it
  - ignore it
  - talk to someone

### history

#### Template

Format: choice
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...
Options:
  - first option
  - second option

#### A moment from the last year you'd want a stranger to know.

Format: choice
Probe:
  Surface: identity-presentation default — what they want strangers to know.
  Inversions: a win = forward-leaning, possibly performing competence; a loss = unguarded, possibly recently processed; something funny = uses humor as connection or armor; "something i can't quite explain" = the deepest answer, often grief-adjacent or numinous.
  Watch for: the picked frame is the user's current public-facing self-story.
Options:
  - a win
  - a loss
  - something funny
  - something i can't quite explain

#### What's different about you, compared to a year ago?

Format: choice
Probe:
  Surface: change-narrative direction.
  Inversions: softer = has been through something opening; harder = has been through something protective, possibly post-betrayal; clearer = a fork resolved or a value clarified; more lost = mid-rupture or post-rupture; "same person, different problems" = either grounded or stuck.
  Watch for: "more lost" is a tentative seed for "current fork is acute" — pair with bar-tap on 9-fork.
Options:
  - i'm softer
  - i'm harder
  - i'm clearer
  - i'm more lost
  - same person, different problems

### relationships

#### Template

Format: relationship_pick
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...

#### With whom have you left the most unsaid?

Format: relationship_pick
Probe:
  Surface: the unresolved relational anchor.
  Inversions: who they pick is the person the live fork is most likely to circle. register the silence as load-bearing — what's unsaid IS the question for the cards.
  Watch for: if they pick the same person they picked on key_person, the bond is the question. if it's a different person, there's a triangulation.

#### Are you someone's secret?

Format: binary
Probe:
  Surface: relational concealment probe.
  Inversions: yes = the user is the hidden one — suspect an affair, a stigmatized relationship, an estrangement; no = nobody is hiding the user; sometimes = situational concealment, often the most revealing answer (work / family / public-facing contexts).
  Watch for: "yes" + "i've stopped checking" perceived_as = chronic invisibility wound.

#### Who's in your head tonight?

Format: choice
Probe:
  Surface: live attention to a specific person.
  Inversions: a parent = unfinished family material, possibly fork-adjacent; a partner / ex = current relational fork; a friend = either a confidant or a recently-frayed bond; someone i'm avoiding = the diagnostic answer — they've named the avoidance.
  Watch for: "someone i'm avoiding" + with-whom-unsaid pointing to the same person = high-confidence load-bearing silence.
Options:
  - a parent
  - a partner / ex
  - a friend
  - someone i'm avoiding

### joys

#### Template

Format: choice
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...
Options:
  - first option
  - second option

#### Is there something you make?

Format: choice
Probe:
  Surface: creative identity probe.
  Inversions: "yes — i make" = stable creative practice; "yes but i don't call it that" = humility or impostor pattern, the practice exists but is unclaimed; "not really" = either accurate or self-effacing; "i used to" = creative identity loss, specific kind of grief.
  Watch for: "i used to" is high-signal — pair with what-have-you-been-putting-off and yearnings probes.
Options:
  - yes — i make
  - yes but i don't call it that
  - not really
  - i used to

### fears

#### Template

Format: choice
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...
Options:
  - first option
  - second option

#### When you're anxious, other people notice it in your—

Format: choice
Probe:
  Surface: where anxiety shows externally.
  Inversions: voice = vocal markers (pitch, speed, halting); hands = physical, harder to mask; eyes = facial micro-expression, the hardest to hide; "they don't notice" = either skilled masker or genuinely externally calm (rare); also possibly socially isolated.
  Watch for: "they don't notice" + "performing" axis on how-are-you-actually matrix = high-mask pattern.
Options:
  - voice
  - hands
  - eyes
  - they don't notice

### insecurities

#### Template

Format: choice
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...
Options:
  - first option
  - second option

#### Who haven't you been honest with lately?

Format: choice
Probe:
  Surface: dishonesty target.
  Inversions: the person i should have told = the bond is active and the silence is acute, name the relationship later; myself = self-deception, often the deepest answer; no one comes to mind = either grounded or unaware; everyone, a little = exhausted by social performance, identity is the lie.
  Watch for: "myself" + lies-i-tell-myself = high-confidence self-deception pattern. "the person i should have told" + with-whom-unsaid = the same person, look for who.
Options:
  - the person i should have told
  - myself
  - no one comes to mind
  - everyone, a little

#### How many people know the real version of you?

Format: choice
Probe:
  Surface: depth of relational disclosure.
  Inversions: many = either trust-rich or self-presented as flat; a few = healthy intimacy ceiling; maybe two = small inner circle, possibly the partner + one friend or family member; just me = isolation, either chosen or chronic.
  Watch for: "just me" + low engagement = guarded but possibly relieved to be seen here.
Options:
  - many
  - a few
  - maybe two
  - just me

#### What do you tell yourself that isn't quite true?

Format: choice
Probe:
  Surface: self-deception script.
  Inversions: "i'm fine" = chronic minimization, often trauma-shaped; "i don't care" = protective indifference, suspect what's actually being defended; "i'll get to it" = procrastination as anxiety regulation; "they understand" = projecting empathy that may not be present, often relational over-investment.
  Watch for: "they understand" + key_person → that key person may NOT in fact understand, and the user has built around the assumption.
Options:
  - "i'm fine"
  - "i don't care"
  - "i'll get to it"
  - "they understand"

#### You pull away when—

Format: choice
Probe:
  Surface: trigger for attachment retreat.
  Inversions: someone gets too close = avoidant attachment pattern; someone disappoints me = punishing-distance pattern; "i feel small" = shame-based withdrawal; "i don't, actually" = either secure attachment or denial.
  Watch for: "i don't, actually" + low engagement = possibly denial; with high engagement = possibly genuine secure base.
Options:
  - someone gets too close
  - someone disappoints me
  - i feel small
  - i don't, actually

#### The thing you're most proud of and most ashamed of might be the same thing. what is it?

Format: choice
Probe:
  Surface: integrated shame-pride node.
  Inversions: how much i give = caretaking pattern, possibly over-functioning; how much i hold back = restraint as identity, possibly self-protective; how hard i work = productivity-as-worth pattern; how much i need = need-shame, often the deepest answer in this set.
  Watch for: "how much i need" is the most loaded — pair with what-do-you-protect (often "my heart") and pull-away-when (often "someone gets too close").
Options:
  - how much i give
  - how much i hold back
  - how hard i work
  - how much i need

### yearnings

#### Template

Format: choice
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...
Options:
  - first option
  - second option

#### What have you been putting off?

Format: choice
Probe:
  Surface: avoided action.
  Inversions: a conversation = relational rupture pending, suspect with-whom-unsaid target; a decision = the live fork; a goodbye = a relationship in its dissolving phase; "something for myself" = self-care collapse, often paired with caretaking patterns.
  Watch for: "a decision" + bar-tap on fork = the live fork IS this decision.
Options:
  - a conversation
  - a decision
  - a goodbye
  - something for myself

#### If you weren't doing what you do, you'd be—

Format: choice
Probe:
  Surface: alt-life imagining.
  Inversions: "doing something specific" = clear yearning, an alt-life identity exists in their head; "something different" = vague restlessness; "not sure" = either genuinely settled or under-imagined; "anything else" = active dissatisfaction with current work.
  Watch for: "doing something specific" + value_most-mismatch with current work = the yearning is real and unaddressed.
Options:
  - doing something specific
  - something different
  - not sure
  - anything else

### now

#### Template

Format: choice
Probe:
  Surface: ...
  Inversions: ...
  Watch for: ...
Options:
  - first option
  - second option

#### Where do you carry the most pain? if you closed your eyes and imagined your pain as heat in your body, where is it hottest?

Format: choice
Probe:
  Surface: somatic anchor for healing work — where the user is HOLDING distress.
  Inversions: head = cognitive load / overthinking; back = chronic-stress carrier; shoulders = duty / care-load weight; neck = controlled fear, often boundary-related; gut = unmetabolized emotional content, anxiety-coded.
  Watch for: cross with relational answers — head + work-feeling-slog = cognitive overload from job; gut + with-whom-unsaid → that person is emotionally upsetting at a body level.
Options:
  - head
  - back
  - shoulders
  - neck
  - gut

#### Does where you live feel right?

Format: choice
Probe:
  Surface: geographic congruence.
  Inversions: yes = stable; "for now" = transitional, may be pre-move; "no, but i stay" = active mismatch with location, suspect why they stay (job / relationship / money / fear).
  Watch for: "no, but i stay" is high-signal — pair with would-rather-be and with-whom-unsaid.
Options:
  - yes
  - for now
  - no, but i stay :: we'll come back to that.

#### It's late. what are you thinking about right now?

Format: choice
Probe:
  Surface: nighttime mental load.
  Inversions: someone = relational rumination; "something i did" = regret; "something i didn't do" = avoidance, possibly the live fork; "nothing, i'm asleep" = either grounded or evasive.
  Watch for: "something i didn't do" is a near-tell for stasis-as-fork — pair with what-have-you-been-putting-off.
Options:
  - someone
  - something i did
  - something i didn't do
  - nothing, i'm asleep :: lucky.

#### Where are you tonight, {name}?

Format: matrix
Probe:
  Surface: present-state two-axis read.
  Inversions: calm + in head = grounded interior; calm + with people = grounded social; chaotic + in head = anxious rumination, the classic spiral; chaotic + with people = overwhelm, possibly conflict-adjacent.
  Watch for: chaotic + in head + bar-tap on 9-fork = the fork is acute and the user came here looking for purchase.
Axes:
  - x: calm | chaotic
  - y: in head | with people
Options:
  - calm + in head
  - calm + with people
  - chaotic + in head :: spiraling, in your head. classic.
  - chaotic + with people

#### What does work feel like — your job, your practice, whatever you call it?

Format: choice
Probe:
  Surface: occupational valence.
  Inversions: meaningful = engaged; fine = either stable or under-invested; "a slog" = strong candidate for the fork (career-shaped); undefined = either between jobs or in identity transition.
  Watch for: "a slog" + alt-life-doing-something-specific = career-fork. "undefined" + perceived_as as the role i play = identity-without-anchor.
Options:
  - meaningful
  - fine
  - a slog
  - undefined :: tell me more.

#### How are you, actually?

Format: matrix
Probe:
  Surface: state + honesty two-axis.
  Inversions: honest + okay = unguarded baseline; honest + not okay = vulnerable, treat tenderly; performing + okay = performance baseline, may be hiding ease; performing + not okay = high mask, the most diagnostically loaded.
  Watch for: performing + not okay + perceived_as as more put together than i am = sustained masking pattern.
Axes:
  - x: honest | performing
  - y: okay | not okay
Options:
  - honest + okay
  - honest + not okay :: thank you for telling me.
  - performing + okay
  - performing + not okay :: i see you.
