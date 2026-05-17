// Jade home page — landing for the editor. A friendly greeting, two
// editor entrances, and prose+diagram docs for the two engines under
// the hood (survey + reading). Designed to be readable cold so a non-
// engineer can build a mental model of what's happening before they
// start changing things.

type Props = {
  onOpenSurvey: () => void;
  onOpenPersona: () => void;
};

export function JadeHome({ onOpenSurvey, onOpenPersona }: Props) {
  return (
    <div className="jade-home">
      <section className="jade-home__hello">
        <h1 className="jade-home__hi">Hi Jade!</h1>
        <p>
          this is your editor for tarobot's two brains — the <strong>survey</strong>{' '}
          (the cat that interviews the user) and the <strong>seer</strong>{' '}
          (the tarot reader who actually reads). everything you change here lives in
          your browser's local storage and the live app reads from it on every page
          load. export when you want to bake your changes into the shipped version.
        </p>
        <p className="jade-home__hint">
          (also: there's a debug toggle in the navbar — flip it on while testing.
          shows fps, audio state, which LLM is currently thinking, recent errors,
          etc. mostly useful when you screenshot something weird and want claude
          to be able to see what was going on under the hood.)
        </p>
      </section>

      <section className="jade-home__editors">
        <div className="jade-home__editors-label">EDITORS:</div>
        <div className="jade-home__editor-buttons">
          <button type="button" className="jade-home__editor-btn" onClick={onOpenSurvey}>
            <span className="jade-home__editor-name">SURVEY</span>
            <span className="jade-home__editor-sub">
              the questions clat asks · grouped by topic · 40 nodes
            </span>
          </button>
          <button type="button" className="jade-home__editor-btn" onClick={onOpenPersona}>
            <span className="jade-home__editor-name">PERSONA</span>
            <span className="jade-home__editor-sub">
              the seer's voice + how she prepares for each card
            </span>
          </button>
        </div>
      </section>

      <section className="jade-home__doc">
        <h2 className="jade-home__doc-title">survey engine</h2>
        <div className="jade-home__doc-prose">
          <p>
            the survey is a one-shot intake: the cat (clat) asks the user a sequence
            of multiple-choice questions, and by the end of it the app has a{' '}
            <strong>profile</strong> rich enough for the seer to read from. it's not
            a personality test — it's a structured way to surface what's actually
            live for the person right now.
          </p>
          <p>
            two LLM agents run on each pick:
          </p>
          <ul>
            <li>
              <strong>observer</strong> (haiku · fast · runs in the background) —
              reads the answer + a per-answer{' '}
              <em>interpretation hint</em> from the tree, then updates slots in the
              profile: cast (people in their life), threads (recurring patterns),
              hunches (best guesses), and "the choice" (a candidate fork the seer
              will orbit). this never blocks the user.
            </li>
            <li>
              <strong>investigator</strong> (sonnet · cognition · the user waits
              on this) — reads the running profile + the pool of unasked questions,
              picks what to ask next, and writes a one-line preamble in clat's
              voice. it's the slow one because picking{' '}
              <em>the right next question</em> is the actual craft of the survey.
            </li>
          </ul>
          <p>
            the survey closes on any of: saturation (the profile has enough
            structure for a real reading), fatigue (the user is checking out),
            a hard turn cap, or the user clicking "ready for the cards →". after
            close, the <strong>compiler</strong> (sonnet) runs once: it synthesizes
            everything into a 200-400 word prose brief and names <em>the choice</em>{' '}
            explicitly. that brief is what the seer reads from.
          </p>
          <p>
            in jade you edit the question pool — every question has a topic
            (intake / state / relational / self / decisions / projective / meta),
            a format (binary / choice / multi / matrix / text / date), answer
            options, and optional inline comments per answer (clat reacts to the
            pick before moving on). the openers are the four intake questions and
            always run first in stored order. everything else is fair game for
            the investigator to pick from.
          </p>
        </div>
        <pre className="jade-home__diagram">{SURVEY_DIAGRAM}</pre>
      </section>

      <section className="jade-home__doc">
        <h2 className="jade-home__doc-title">tarot engine</h2>
        <div className="jade-home__doc-prose">
          <p>
            the reading takes the survey's brief and uses it to read the user. a
            theatrical analogy lives at the heart of this: the persona (the seer)
            is a stage actor; cognition (claude under the hood) is her preparation,
            not her script. when a card flips, cognition has already prepared a{' '}
            <strong>set</strong> for that card — given circumstances, in
            stanislavski's sense — and the seer{' '}
            <em>inhabits</em> the set and speaks from it. the words emerge from a
            prepared interior, not from translation.
          </p>
          <p>
            three things happen per reading:
          </p>
          <ul>
            <li>
              <strong>intro</strong> — the seer's opening line, before any cards
              flip. lands the user in the room, names nothing specific yet.
            </li>
            <li>
              <strong>per-card fan-out</strong> — at the start of each round R
              (R = how many cards the user has flipped + 1), the engine spawns one
              cognition+persona pair{' '}
              <em>per still-face-down slot, in parallel</em>. each pair sees only
              its own card + previously revealed cards. when the user picks a
              slot, we look up the pre-prepared beat for [round, slot] and deliver
              it. wasteful by design (~10 calls per reading), but it means there's
              never a "thinking..." stall between flips, and cognition never gets
              to cheat by seeing the future.
            </li>
            <li>
              <strong>closing</strong> — after all four flips, one cognition →
              persona pair synthesizes a structural takeaway across the whole arc.
              not a recap; a lens.
            </li>
          </ul>
          <p>
            the seer's voice is{' '}
            <strong>mirror, not oracle</strong> — she never predicts outcomes, she
            illuminates the user's relationship to the choice they're sitting at.
            "you are between two cities" beats "you will move to denver."
            "i see a parting, and you already know what that means, don't you?"
            beats "you will leave your partner." specificity is sparing and
            surgical — under-specifying on purpose is itself a craft move, because
            the user fills in the meaning and{' '}
            <em>they</em> made the connection, which is why they feel seen.
          </p>
          <p>
            in jade's persona editor (coming soon) you'll edit the voice bible
            (the master prompt that defines who the seer is), the per-call prompts
            (intro / per-card / closing / chat), and the character cards (cassandra,
            mater tenebris, the geometer — different seers for different moods).
          </p>
        </div>
        <pre className="jade-home__diagram">{TAROT_DIAGRAM}</pre>
      </section>
    </div>
  );
}

const SURVEY_DIAGRAM = `SURVEY ENGINE
══════════════════════════════════════════════════════════════════

LEGEND
  tiers:  fast = Haiku · cognition = Sonnet · deep = Opus
  →       synchronous handoff
  ⇒       async (engine continues before this completes)
  ║       parallel branches


  PARTICIPANT arrives
         │
         ▼
╭──────────────────────────────────────────────────────────╮
│  OPENERS  ·  4 deterministic intake questions            │
│  ───────                                                 │
│    name → birthday → birth_time → has_question           │
│    no agent fires; engine walks the openers list in      │
│    stored order. each answer goes straight into PROFILE  │
╰─────────────────────────┬────────────────────────────────╯
                          │
                          ▼   agents fire from here on
╭──────────────────────────────────────────────────────────╮
│  PER PICK  ·  Observer + Investigator                    │
│  ────────                                                │
│                                                          │
│     user picks an answer                                 │
│              │                                           │
│      ┌───────┴────────┐    ║                             │
│      ▼                ▼                                  │
│  ┌──────────┐    ┌─────────────────┐                     │
│  │ OBSERVER │    │  INVESTIGATOR   │                     │
│  │ fast · ⇒ │    │  cognition · →  │                     │
│  │          │    │                 │                     │
│  │ reads    │    │  reads PROFILE  │                     │
│  │ pick +   │    │  + remaining    │                     │
│  │ interp   │    │  pool;          │                     │
│  │ hint;    │    │  picks the next │                     │
│  │ updates  │    │  question +     │                     │
│  │ PROFILE  │    │  a one-line     │                     │
│  │ slots    │    │  preamble in    │                     │
│  │ (cast,   │    │  clat's voice   │                     │
│  │ threads, │    │                 │                     │
│  │ hunches, │    │                 │                     │
│  │ choice…) │    │                 │                     │
│  └──────────┘    └─────────────────┘                     │
│                                                          │
│  Observer is non-blocking — its result lands when it     │
│  lands, no user wait.                                    │
│  Investigator IS the user-blocking call — dialogue       │
│  shows "thinking…" while it runs.                        │
╰─────────────────────────┬────────────────────────────────╯
                          │
                          ▼   loops until a CLOSE trigger
╭──────────────────────────────────────────────────────────╮
│  CLOSE  ·  predicates (any one fires)                    │
│  ─────                                                   │
│    saturation   profile is "ready_to_close" + has spine  │
│    fatigue      user picks defaults / short latency      │
│    cap          hard turn-count ceiling                  │
│    user_exit    "ready for the cards →" button           │
╰─────────────────────────┬────────────────────────────────╯
                          │
                          ▼   one final synthesis pass
╭──────────────────────────────────────────────────────────╮
│  COMPILER  (cognition)                                   │
│  ─────────                                               │
│  Reads the accumulated PROFILE, names THE CHOICE,        │
│  writes a 200-400 word prose brief.                      │
│  Hands off to the Reading.                               │
╰──────────────────────────────────────────────────────────╯


THE BRIEF (what the seer reads from)
─────────
   PROFILE        who they are
    ├ cast         named people in their life
    ├ threads      recurring patterns across picks
    └ hunches      guesses + confidence

   THE CHOICE     ◄── the spine. everything downstream orbits this.
    ├ fork
    ├ branch_A / branch_B
    ├ key_tensions
    └ things_unsaid

   OPENERS        conversational seeds for the seer
   PROSE          human-readable summary (200-400 words)
`;

const TAROT_DIAGRAM = `TAROT ENGINE
══════════════════════════════════════════════════════════════════

LEGEND
  tiers:  fast = Haiku · cognition = Sonnet · deep = Opus
  →       synchronous handoff
  ⇒       async (engine continues before this completes)
  ║       parallel branches


  THE BRIEF (handed in from Survey)
         │
         ▼
╭──────────────────────────────────────────────────────────╮
│  SETUP                                                   │
│  ─────                                                   │
│   SPREAD   drawn once at mount · 4 cards · diamond       │
│   INTRO    persona (deep) opens — voiced from The Brief, │
│            may use OPENERS, drops no specific noticings  │
│   SCENE    3D table; all 4 cards face_down               │
│                                                          │
│   ⇒ first ROUND's fan-out kicks off here, behind INTRO   │
╰──────────────────────────────────────────────────────────╯

  per ROUND R   (R = revealed.length + 1)
  ──────────

  FAN-OUT — parallel, for each still-face-down slot S:
  ┌────────────────────────────────────────────┐
  │  PREPARE SET   (cognition)                 │
  │   sees:   Profile · Choice · this card ·   │
  │           revealed history                 │
  │   blind:  other face-down cards            │
  │   → THE SET (given circumstances)          │
  │     ├ click          what resonates here   │
  │     ├ attending      threads now in view   │
  │     ├ intent         confront/comfort/etc  │
  │     ├ knows          facts persona may use │
  │     ├ uncertainty    what's not yet clear  │
  │     └ through-line   back to The Choice    │
  └─────────────────┬──────────────────────────┘
                    ▼   pipelined per-thread
  ┌────────────────────────────────────────────┐
  │  PERFORM BEAT  (persona · deep)            │
  │   inhabits THE SET; speaks from it         │
  │   words emerge from prepared interior,     │
  │   not translation                          │
  │   → BEAT cached at [R, S]                  │
  └────────────────────────────────────────────┘

  USER LOOP
  ─────────

   user picks a face-down slot
      (chat may interleave — detours to single-shot
       persona reply, then returns to the loop)
        │
        ▼
   FLIP     scene: face_down → face_up
   LIFT     scene: face_up → lifted (toward camera)
            subtitle pops: the card's name
   BEAT     cached BEAT delivered, chunked, user-paced
   RETURN   scene: lifted → face_up flat

   ⇒ next ROUND's fan-out kicks off here, behind BEAT

   if revealed.length < 4 → next ROUND
     (re-fan-out for remaining face-down slots)

  ──────────────────────────────────────────

  CLOSING  (cognition → persona)
  ───────
   cognition: structural takeaway across all four cards
              — a lens, not a verdict
   persona:   OUTRO — the thread left in their hand

  DONE — chat stays available, EXIT in topbar


SIDE CHANNELS  (concurrent)
─────────────

  CHAT       user ↔ The Seer between rounds.
              user submits → phase enters chat_pending
              → persona reply → resumes prior phase
              appended to state.chat → mirrored in transcript

  TRANSCRIPT left-column mirror. items: intro · each beat
             (with card label) · chat exchanges · outro.
             auto-scroll, copy-as-text.

  STALLS     while awaiting_tier ≠ null, dialogue shows a
             stall catchphrase; eyes spin / dust ramps.


HIERARCHY:  SURVEY → COMPILER → BRIEF → READING
            (setup → per-round fan-out → user loop → closing)

THE CHOICE is the spine.
COGNITION prepares SETS, PERSONA performs BEATS, STORY emerges.
`;
