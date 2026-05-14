# tarobot — backlog

Living list of stuff worth doing but not in the current iteration. Roughly
ordered by leverage / hand-feel, not by urgency.

## survey

### question prefix extraction
Several pool nodes share a prefix across their answer options:

- `whats_true` — every option begins with "something is …"
- `who_in_head` — 3 of 4 options begin with "someone …" (the outlier is "no one")
- `what_is_stuck` — pure variation, no shared prefix
- `time_orientation` — "the …" prefix on 3/4

For the cases with a clean shared prefix, the prefix could be extracted into
the question text (indented one tab, in brand purple) and the buttons reduced
to just the differentiator. e.g. `what's true right now?` followed (indented)
by `something is …` and buttons `stuck` / `unsaid` / `ending` / etc.

The edge case: `who_in_head` has "no one" which doesn't fit the "someone"
prefix. So this isn't a pure tree-level transformation — the tree would need
to mark which answers share the prefix and which break out. Probably an
optional field on the node, e.g. `answer_prefix: "something is "` plus a
per-answer flag that overrides.

Implementation sketch:
- Add `answer_prefix?: string` to TreeNode
- In renderQuestion: if all answers (after the prefix) are unique, strip the
  prefix from each and inject it as a sub-line of the dialogue text
- Mark answers that should NOT take the prefix (e.g. "no one" on who_in_head)
  with a leading sentinel like `!no one` in the tree

Backlog this until the survey gets another revision pass — small UX polish
that needs care to not over-engineer.

### the vague-info concern
User flagged: vague checklists ("something is stuck" + "something is unsaid")
may produce a Profile.brief that confidently mis-states what's going on. The
Observer infers a person, infers stakes, infers a fork — based on signals
that are inherently vague.

Possible mitigations:
1. **Confidence levels through to the brief.** Already present in the
   Choice type but not always surfaced in the prose_brief. Reinforce in the
   Compiler prompt: "low confidence" claims must be hedged in prose ("appears
   to be" not "is").
2. **Stop inferring cast members from a single vague signal.** Cast.confidence
   should require multiple supporting picks, not one.
3. **Add `i don't know` / `not really` / `nothing comes to mind` as a
   first-class non-answer.** Multi-select with 0 boxes already means "nothing
   is", but for single-choice questions there's often no clean opt-out beyond
   `pass` (which is filtered).
4. **Investigator-injected text questions.** When inference confidence is
   middling, the Investigator could surface a text-input follow-up that asks
   directly for the specific thing. See below.

### investigator-injected text questions
User idea — currently all roots are multi-choice. The Investigator should be
able to inject a single text-input question as a "special root" when it spots
a thread worth pinning down specifically. Constraints:

- Only one special question may be queued at a time (so the choice rhythm
  isn't broken by back-to-back free text)
- Looks like a normal question to the user except the input is a text field
- Counts as a regular root in the queue
- Output goes directly into the Profile as a quote, not interpreted

Implementation sketch:
- Add `f: 'text'` (already exists) to InvestigatorOutput.next_question's
  allowed formats when GENERATED
- Engine accepts `GENERATED` with `f: 'text'`, an `options: []` array, and a
  `text` field that becomes the question prompt
- A flag in EngineState tracks `has_pending_special_question` so the next
  Investigator call knows not to inject another

### returning-user UI
Data layer done (`findReturningUser`, `seedFromReturning`, engine accepts
returning seed at construction). Missing: the "is this you?" modal on name
collision. Should appear after the name is submitted; offers options for each
match with disambiguator (birthday year), or "no, different name". On
confirm, the engine reboots with the returning seed so heat starts at 0.45
and openers 2-4 are skipped if data is present.

### heat / saturation comeback
Removed in 314b850 per direction. If the survey gets too rambly without a
close signal we can reintroduce a soft "she's heard enough" trigger — but
ideally that's the Investigator's saturation_signal, not a turn-count cap.

## scene / UI

### Clat animations from claude-cat repo
User has a `Code/claude-cat/` repo with a compacting animation (eyes spin)
and likely other affectations worth porting. Currently the dizzy state uses
a synthetic eye-spin (cycle through 8 look-direction frames). Native
animations would feel more deliberate.

### layout responsiveness
The pinned layout (commit pending) targets one desktop size. Mobile sizing
is still inherited from the existing media queries. Worth a dedicated pass:
single mobile breakpoint, fixed dimensions at that breakpoint too, no
sliding between sizes mid-survey.

### transcript viewer
Survey runs are saved to `tarobot:survey-logs` in localStorage. There's a
download button on the closed screen, but no in-app way to browse past runs.
Add a "logs" subsection under Settings.
