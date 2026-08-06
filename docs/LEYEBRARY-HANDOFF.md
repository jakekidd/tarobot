# the leyebrary — handoff

> For whoever is running the whole show. This is the eye system: what
> it is, the two calls you actually drive, and the three constraints
> you must not quietly break.
>
> Library + rationale: `src/leyebrary/README.md`. That doc is the
> *why*. This one is the *how do I use it*.

---

## 1. Where it lives

Branch **`leyebrary`** in a clone at `~/Code/tarobot-leyebrary`.
Nothing pushed, nothing merged, `main` untouched — jakek was working
in `~/Code/tarobot` live and asked that it not be disturbed.

To take it: merge `leyebrary` into `main`. It touches
`src/leyebrary/**` (new), `src/ui/booth/BoothScene.ts`,
`src/ui/booth/boothStage.ts`, `src/ui/booth/BoothDemo.tsx`,
`eyelab.html` + `vite.config.ts` (a second dev page), and
`tests/leyebrary-*.test.ts`. It does not touch the pipeline.

Verify after merging:

```
pnpm typecheck && pnpm lint && pnpm build && pnpm smoke:booth
pnpm vitest run tests/leyebrary-math.test.ts tests/leyebrary-trip.test.ts \
  tests/leyebrary-anatomy.test.ts tests/leyebrary-vision.test.ts \
  tests/leyebrary-mood.test.ts        # 104 assertions
pnpm dev   # then /eyelab.html for the lab, / for the booth
```

`tests/ensemble.test.ts` fails on `main` already (imports a deleted
`src/pipeline/ensemble/stall`). Not from this work.

---

## 2. The entire API you need

Two calls. That is the whole surface.

```ts
rig.setMood(mood)   // what she is DOING
rig.arouse(amount)  // the visitor did something small
```

**Never call `setLook()` from show code.** Look names are shader
modes; they will get renamed, retuned, and reordered. `setMood` is the
contract. If a mood you need doesn't exist, add it to
`src/leyebrary/mood.ts` — don't reach past it.

### The moods

```ts
{ kind: 'listening' }                      // visitor's turn
{ kind: 'thinking' }                       // a model call is in flight
{ kind: 'speaking', intent: SpeechIntent } // a line is landing
{ kind: 'closed' }                         // session over
```

`setMood` is idempotent — call it every frame, it only acts on change.
It picks the look, the crossfade time, and the breath depth.

### The six speech intents

The 15 grammar beats collapse to 6. That collapse is deliberate: a
beat type is a production-grammar concept, and there is no reason the
eyes need 15 states. What reads is whether she is hunting, showing,
blessing, or leaving.

| intent | beats | eyes |
|---|---|---|
| `greet` | greeting | the session's own seeded flower |
| `probe` | question, guess, rant_bid, focus | the spiral — she is reaching |
| `reveal` | deal, flip_invite, read | kaleidoscope burst, fastest fade |
| `name` | naming, honor, charm | back to the visitor's own flower |
| `close` | quest, close | the tunnel, everything walking inward |
| `hold` | hold, tissue | the soft register, nothing demanded |

`intentOfBeat(beatType)` does the lookup and **falls back to `hold`
for anything unknown or null** — a new beat type will never crash the
eyes, it will just read as holding. If you add a beat, add it to
`BEAT_INTENT` or accept that default.

### Arousal

`rig.arouse()` per keystroke. Already wired in `BoothDemo`'s input
`onChange`, gated to *growth* so backspacing doesn't trigger it.

The law (`arousalStep` in `math.ts`): each nudge closes a fixed
fraction of the remaining gap to 1. That gives all three properties
at once — diminishing (the 10th keystroke moves it less than the 1st),
bounded (it can never reach 1, so dilation can never exceed
`AROUSAL.dilate`), and slow-decaying (1.9 s half-life, frame-rate
independent).

Measured live: rest pupil 0.300 → 0.351 after 12 keystrokes → **0.356
after 400** → back to 0.3015 on its own. Hammering the keyboard buys
you almost nothing over typing normally, which is the point.

**When speech input lands**, call `arouse()` per detected syllable or
per VAD voice-active tick with a smaller amount (try `arouse(0.4)` at
~10 Hz). Do not call it per audio frame — the law is per-event, and
at 60 Hz you'd sit pinned near the ceiling.

---

## 3. What is already wired

- `boothStage.view()` now carries `beat: string | null` — the grammar
  beat behind the current line.
- `BoothScene.update()` maps the view to a mood and calls `setMood`.
  Nothing else in the booth names a look.
- `BoothScene.arouse()` is a passthrough; `BoothDemo` calls it on
  typing.
- Thinking **cycles on its own** — vision → trails → pinna, 7.5 s
  each. A face frozen through a 20 s model call reads as a hang, so
  the library refuses to sit still. You don't drive this.
- Cords, breathing, blink, lids, gaze, and the session genome all run
  without show involvement. `rig.setGazeTarget(v3)` if you ever want
  her to look at something other than the camera.

## 4. What is NOT wired (deliberate)

- **Speech → arousal.** The hook exists, the caller doesn't.
- **`blink()` is never called.** The rig never blinks on its own —
  that was a deliberate earlier decision (blink was removed from the
  booth once already). If you want punctuation blinks, call it; the
  envelope is there and tested.
- **`setLid()` for drowsiness / the close.** Unused. `{kind:'closed'}`
  currently only changes the look, not the lids.
- **The eyeball-on-the-table gag.** The rigging supports it now — each
  cord is a child of its globe, anchored at the ball's centre, so an
  eye can be detached and thrown and its stalk follows. Nothing
  animates it yet.

---

## 5. Three constraints. Do not break these quietly.

**5.1 — No flicker in the 3–30 Hz band.** Flicker induces geometric
hallucinations best at 9–15 Hz, and that is squarely the
photosensitive-epilepsy provocation band. This is an unscreened night
crowd, on psychedelics, in the highest-risk age bracket and
sleep-deprived (sleep deprivation OR 5.97, age 21–30 OR 5.03). The
temptation is real and documented in the README so nobody rediscovers
it as a good idea. Nothing in the library modulates whole-field
luminance above ~2 Hz. Keep it that way.

**5.2 — The stripe cap.** The same Epilepsy Foundation consensus caps
*pattern* structure, not just flash rate: no more than **five**
light-dark stripe pairs if the pattern oscillates or reverses, eight
if it only drifts one way. `FORM.k = 5` and there is a test that fails
if anyone raises it. Real reported form constants carry 30–40
repetitions — we took the safety number instead, knowingly.

**Not yet audited:** `mandala` draws up to 12 rose petals, `bloom` is
a dense phyllotaxis lattice, `descent` has 8 spokes. Before this runs
on a large bright panel at close viewing distance, someone should
count stripes per look at the real geometry.

**5.3 — Two harmless-looking edits kill the `pinna` illusion.**
Half-wave rectifying the element, or swapping its Gaussian envelope
for a hard circular aperture. Both broaden the spatial-frequency
bandwidth, and the aperture problem is only unsolvable for narrowband
patterns. There is a test asserting the field stays signed.

---

## 6. Open questions for jakek

1. **Booth eye scale.** The eyes are small on screen at the current
   camera. Bigger reads better but pushes toward the 5.2 thresholds.
2. **`closed` should probably lower the lids**, not just change the
   look. One line, but it's a directorial call.
3. **Which look is "her".** Right now the session's seeded `mandala`
   is the identity look and `nebula` is idle. Could be inverted.
4. **Motion mode.** Default is `both` (0.55 body share). `pupil` is
   the flat decal look, `eye` is doll-like. `both` at extreme gaze is
   the only configuration where the cords stay fully tucked.
5. **Cords on the far-field booth?** They read beautifully close up
   and become near-invisible small. Might want scale-aware opacity.

---

## 7. Reference

- Semantic layer: `src/leyebrary/mood.ts`
- Rig + lifecycle: `src/leyebrary/EyeRig.ts`
- Formulas (all mirrored in TS and tested): `src/leyebrary/math.ts`
- Shaders (constants interpolated from the tested TS, so they cannot
  silently drift): `src/leyebrary/glsl.ts`
- The lab: `/eyelab.html` — every look, live, with motion/cords/
  breath/grade/lid/dolly controls, `window.rig` exposed, and
  `window.leyeStep(frames, dt)` to advance deterministically when a
  background tab throttles rAF.
