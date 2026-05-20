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
- **Pillars** is the structural backbone. The 6 questions here are
  asked in this order at the start of every survey (after name /
  birthday / intent, which live in code because they have special UI).
  Order matters. Move questions to reorder.
- **Pool** is the random pool. The engine draws 14 questions from here
  per first-time visit (or 6 dedup'd against the user's history for
  returning visits). Order doesn't matter inside the pool.
- Fields per question:
  - `Format`: one of `choice` | `binary` | `matrix` | `relationship_pick`.
    (Openers `text` / `date` / `intent` are code-only.)
  - `Probe`: a one-line note to the detective explaining what this
    question REALLY tests for. Optional but encouraged — empty probes
    leave the detective guessing. Authors who skip this are leaving
    intelligence on the table.
  - `Options`: bullet list of answer choices. Required for `choice`.
    `binary` ignores it (locked to yes / no / sometimes).
    `relationship_pick` ignores it (own UI).
    Each option can be followed by `:: comment` — a short line shown
    inline after the user picks that answer.
  - `Axes`: required for `matrix`. Two pairs in `x: a | b` / `y: c | d`
    format.
- Substitution: `{name}`, `{sun_sign}`, `{birth_card}`, `{life_path}`,
  `{age_bracket}` get replaced with profile values at render time.
  Questions with required substitutions only render when the field is set.

---

## Pillars

These are the 6 always-asked questions, in order, post-openers.

### Template

Format: choice
Probe: a one-line note to the detective about what this question tests.
Options:
  - first option
  - second option :: optional inline comment

### How do you make decisions?

Format: choice
Probe: operational style. mind = deliberate / analytic. heart = emotional / valuational. gut = intuitive / felt. distinguishes how the user reaches certainty; biases how the seer should frame the closing read.
Options:
  - mind
  - heart
  - gut

### Who is the most important person in your life?

Format: relationship_pick
Probe: anchor of their relational world. detective: register this person as the central CastMember. their absence or distance from later answers is data.

### How do you think others perceive you?

Format: choice
Probe: self-image vs social-mirror. each option indexes a different relational wound or defense. detective: use this to read the user's tone in later answers, not to label them.
Options:
  - too much
  - not enough
  - as the role i play
  - misunderstood
  - more put together than i am
  - i've stopped checking

### Which of these do you value most?

Format: choice
Probe: what they will sacrifice OTHERS for. abstract priorities collapse the rest of the survey. detective: this is the spine — read every later answer through this lens.
Options:
  - love
  - freedom
  - wisdom
  - beauty
  - mastery
  - power

### What's loudest in your head right now?

Format: choice
Probe: where the user's attention lives. past = retrospective (regret OR something to honor). present = the live moment (a choice or what's already underway). future = forward gaze (anxiety OR longing). detective: pick the valence from texture in later answers, not from the option alone.
Options:
  - past
  - present
  - future

### What does your life not have enough of?

Format: choice
Probe: felt deprivation as values indicator - somatic answers (touch, quiet) skew raw; ego answers (recognition, risk) cross-reference the relational anchor; meaning flags a values-behavior gap; time often masks avoidance. detective: touch is the one people hesitate on - weight it heavily and read it against the relational anchor first.
Options:
  - time
  - quiet
  - touch
  - meaning
  - risk
  - recognition

---

## Pool

Random draws live here. Group by topic; the parser uses the topic
heading (`### topic-name`) to tag each question.

### state

#### Template

Format: choice
Probe: ...
Options:
  - first option
  - second option

#### Where do you carry the most pain? if you closed your eyes and imagined your pain as heat in your body, where is it hottest?

Format: choice
Probe: somatic anchor for healing work. detective: this is where the user is HOLDING distress. cross-reference with later answers — if they pick a heart-loaded option here but never mention a person, the pain is internal; if they pick the head and later complain about work, the cognitive load IS the wound.
Options:
  - head
  - back
  - shoulders
  - neck
  - gut

#### Does where you live feel right?

Format: choice
Options:
  - yes
  - for now
  - no, but i stay :: we'll come back to that.

#### It's late. what are you thinking about right now?

Format: choice
Options:
  - someone
  - something i did
  - something i didn't do
  - nothing, i'm asleep :: lucky.

#### Where are you tonight, {name}?

Format: matrix
Axes:
  - x: calm | chaotic
  - y: in head | with people
Options:
  - calm + in head
  - calm + with people
  - chaotic + in head :: spiraling, in your head. classic.
  - chaotic + with people

#### What's true right now?

Format: choice
Options:
  - something is stuck
  - something is unsaid
  - something is ending
  - something is starting
  - something is too much
  - something is finally good

#### What does work feel like — your job, your practice, whatever you call it?

Format: choice
Options:
  - meaningful
  - fine
  - a slog
  - undefined :: tell me more.

### relational

#### Template

Format: relationship_pick
Probe: ...

#### With whom have you left the most unsaid?

Format: relationship_pick
Probe: identifies the unresolved relational anchor. detective: register the person, register the silence as load-bearing.

#### Who haven't you been honest with lately?

Format: choice
Options:
  - someone close
  - myself
  - no one comes to mind
  - too many to count

#### How do most people see you?

Format: choice
Options:
  - reliable
  - intense
  - kind
  - hard to read

#### And how would you describe yourself?

Format: choice
Options:
  - someone who tries
  - someone tired
  - someone good
  - someone working on it

#### A moment from the last year you'd want a stranger to know.

Format: choice
Options:
  - a win
  - a loss
  - something funny
  - something i can't quite explain

#### The version of you your parents know is—

Format: choice
Options:
  - accurate
  - outdated
  - curated
  - unknown to them

#### How many people know the real version of you?

Format: choice
Options:
  - many
  - a few
  - maybe two
  - just me

#### Are you someone's secret?

Format: binary
Probe: relational concealment probe. yes = the user is the hidden one. no = nobody is hiding the user. sometimes = situational concealment, often the most revealing answer.

#### Who's in your head tonight?

Format: choice
Options:
  - a parent
  - a partner / ex
  - a friend
  - someone i'm avoiding

### self

#### Template

Format: choice
Probe: ...
Options:
  - first option
  - second option

#### When things go wrong, first instinct?

Format: choice
Options:
  - it's my fault
  - it's their fault
  - it's nobody's fault
  - i'll figure it out

#### How are you, actually?

Format: matrix
Axes:
  - x: honest | performing
  - y: okay | not okay
Options:
  - honest + okay
  - honest + not okay :: thank you for telling me.
  - performing + okay
  - performing + not okay :: i see you.

#### Do you keep score?

Format: choice
Options:
  - yes
  - no :: either generous or suppressing resentment.
  - only with the wrong people

#### When did you last change your mind?

Format: choice
Options:
  - recently — big thing
  - recently — small thing
  - long time ago
  - i can't remember

#### What's different about you, compared to a year ago?

Format: choice
Options:
  - i'm softer
  - i'm harder
  - i'm clearer
  - i'm more lost
  - same person, different problems

#### Do you like yourself?

Format: choice
Options:
  - mostly
  - on good days
  - i'm trying to
  - not really

#### Where do you live, in time?

Format: choice
Options:
  - mostly the past
  - mostly the present
  - mostly the future
  - i'm scattered

#### What do you protect?

Format: choice
Options:
  - my time
  - my heart
  - a person
  - a story i tell about myself

### decisions

#### Template

Format: choice
Probe: ...
Options:
  - first option
  - second option

#### Something's wrong. you—

Format: choice
Options:
  - fix it
  - sit with it
  - ignore it
  - talk to someone

#### What have you been putting off?

Format: choice
Options:
  - a conversation
  - a decision
  - a goodbye
  - something for myself

#### What do you want the cards to say?

Format: choice
Options:
  - that i'm right
  - that it'll be okay
  - that i should leave
  - something i'm not expecting

### projective

#### Template

Format: choice
Probe: ...
Options:
  - first option
  - second option

#### If you weren't doing what you do, you'd be—

Format: choice
Options:
  - doing something specific
  - something different
  - not sure
  - anything else

#### Pick a creature. fast.

Format: choice
Options:
  - cat
  - dog
  - bird
  - fish
  - bear
  - something with wings
  - something with teeth

#### Would you rather have a destination with no map, or a map with no destination?

Format: binary

#### You find a door you've never seen. you—

Format: choice
Options:
  - open it
  - knock first
  - walk past
  - go get someone

#### Is there somewhere else you'd rather be right now?

Format: choice
Options:
  - somewhere specific
  - somewhere vague
  - nowhere
  - anywhere but here

#### Is there something you make?

Format: choice
Options:
  - yes — i make
  - yes but i don't call it that
  - not really
  - i used to

### shadow

#### Template

Format: choice
Probe: ...
Options:
  - first option
  - second option

#### What do you tell yourself that isn't quite true?

Format: choice
Options:
  - "i'm fine"
  - "i don't care"
  - "i'll get to it"
  - "they understand"

#### When you need to disappear, you—

Format: choice
Options:
  - go quiet
  - get busy
  - sleep
  - leave

#### When you're anxious, other people notice it in your—

Format: choice
Options:
  - voice
  - hands
  - eyes
  - they don't notice

#### You pull away when—

Format: choice
Options:
  - someone gets too close
  - someone disappoints me
  - i feel small
  - i don't, actually

#### The thing you're most proud of and most ashamed of might be the same thing. what is it?

Format: choice
Options:
  - how much i give
  - how much i hold back
  - how hard i work
  - how much i need

### meta

#### Template

Format: choice
Probe: ...
Options:
  - first option
  - second option

#### Have you done this before?

Format: choice
Options:
  - yes — i read tarot
  - yes — i've had readings
  - sort of
  - never
