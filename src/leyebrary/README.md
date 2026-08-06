# the leyebrary

the library for eyes. every way the oracle's eyes can be, as tested
math. flat 2d shader quads — no spheres, the ping-pong-ball era is
over — attached into one rig that converges, wanders, and morphs as
a single creature.

## why flat, why attached

the sphere-mesh eyes read as ping pong balls because a lit white ball
with a decal iris IS a ping pong ball. the OG eyes (commit `3cdef31`,
may 2026 — canvas planes with a spiral-when-thinking pupil, and the
violet→turquoise ripple pass `0e815d5`) were always flat, and read
better. the leyebrary goes back to flat and upgrades canvas-2d to
glsl: domain warps, feedback loops, and seeded rose curves at 60fps.

attachment is behavioral AND visual:

- **vergence** — each eye aims from its own position at one shared
  gaze target, so near targets cross the eyes. `vergenceAngle`,
  `pupilOffset` in `math.ts`.
- **one saccade stream** — both eyes ride the same low-frequency
  noise walk (92% coupled, per-eye remainder), so they wander
  together, never independently. `saccade`.
- **the membrane** — an additive quad behind the pair: a glow lobe
  per eye and a vesica bridge that lights only where both lobes
  overlap. the tissue between them. `MEMBRANE_FRAG`.
- **one genome** — a session seed grows the same rose mandala in both
  eyes and fixes the palette pairing (`match` or `complement` — the
  right eye slid half a palette cycle).

## the looks

| look | field | lineage |
|---|---|---|
| `nebula` | domain-warped fbm (`fbm(p+A·fbm(p+B·fbm(p)))`) | quilez warp, canonical q/r offsets |
| `hypnosis` | log-spiral `sin(kθ + a·log r − ωt)` — scale-invariant, falls forever | the OG `3cdef31` spiral, generalized |
| `ripple` | summed radial waves from drifting centers | the `0e815d5` violet↔turquoise rings, as true interference |
| `prism` | spiral through a 6-fold kaleido fold | shadertoy kaleidoscope idiom |
| `descent` | log-polar tunnel `sin(b·log r − ωt)·cos(sθ)` | the demo-scene tunnel, ember-voiced |
| `bloom` | vogel phyllotaxis `θ=n·137.508°, r=c√n`, nearest-seed glow | biological order; magnificus green |
| `mandala` | 3 seeded rose curves `r = a·|cos kθ|`, neon line + glow skirt | rhodonea / spirograph / guilloché |
| `trails` | milkdrop feedback loop sampled into the iris | geiss's resample-decay engine |

crossfades between looks are morphs (`uLookMix` blends two full field
evaluations), so a mood change is never a cut.

## the feedback loop (`feedback.ts`)

the engine of every classic visualizer, reduced to one ping-pong
pass: sample the previous frame through the AVS "swirl to center"
polar remap (`d *= 1.01 + 0.04·cos4(r−π/2)`, `r += 0.03·sin4πd` —
verbatim coefficients), decay ×0.965, hue-rotate trails so they
rainbow instead of grey, stamp the active field's crest-lines as
fresh ink, dither ±0.006 so symmetry never locks. the discipline
that keeps feedback tasteful (research-verified from the AVS source):
radial gain in [0.94, 1.06], angular step ≤ 0.1 rad, decay < 1.

## the grade

inscryption's actual trick (mullins, verbatim: darks posterize, lights
don't): luma-thresholded quantization — below the cutoff colors snap
to a 5-level grid, highlights pass free, plus dither. `uGrade` 0..1
mixes it in. `posterize` in `math.ts`.

## anatomy layers (EYE_FRAG, inside-out)

pupil (black well + palette inner ring) → iris (field × palette ×
radial fibers) → limbal ring (the dark rim that makes it an eye) →
void-violet sclera (never white) → lids (slit clip, `lidMask`) →
catchlight (fixed to the eye while the pupil slides with gaze — the
disagreement that makes a flat quad read wet) → dome shading → grade.

the rig never blinks on its own (`blink removed` was deliberate);
`blink()` and `setLid()` exist for deliberate use.

## testing

`tests/leyebrary-math.test.ts` + `tests/leyebrary-trip.test.ts` — 51
assertions over the pure TS mirrors in `math.ts`: palette gamut and
periodicity, noise continuity and fbm bounds, spiral scale-invariance
(scaling radius = rotating arms), kaleido dihedral symmetry, tunnel
zoom-period exactness, phyllotaxis seed placement, rose petal
symmetry and prng determinism, feedback gain discipline, posterize
threshold behavior, vergence/saccade/lid envelopes. `GLSL_CONSTS`
serializes the same numbers into the shaders, so the tested mirrors
and the gpu fields cannot drift silently.

visual confirmation lives at `/eyelab.html` (dev server) — every look
on a live rig, gaze follows the pointer, reseed/pairing/grade/lid
controls. `window.rig` is exposed there for poking.

## research provenance

- iTunes classic = G-Force (o'meara): waveshapes + precomputed
  delta-fields + palette cycling. magnetosphere (hodgin): per-particle
  fft-bin charge physics, additive glow, noise→angle steering.
- milkdrop (geiss): warp-mesh feedback with decay 0.96–0.99,
  edge-zoom fake perspective, `darken_center`, ±0.01 dither.
- winamp avs (source-verified): superscope equations, movement
  remaps — the tasteful-range discipline the feedback tests pin.
- quilez: cosine palettes (canonical coefficient table), domain
  warping, orbit traps.
- inscryption: luma-gated posterize, eyes as the only light in the
  dark, the green possessed-eye layer.

## backlog

- gray-scott reaction-diffusion iris (F=0.0545, k=0.062, seeded from
  the limbal ring) — highest awe, needs its own ping-pong pair.
- julia orbit-trap look, c orbiting the 0.7885 circle.
- beat-locked drift (the avs beatdiv idiom) once the booth has a
  pulse/tempo signal worth locking to.
- feedback ink mode per look (trails currently inks with the spiral).
- low-res nearest-neighbor base + full-res glow compositing (the full
  inscryption down-rez).
