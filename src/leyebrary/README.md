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
| `vision` | cortical stripes seen back through the retino-cortical log map | ermentrout & cowan 1979 — see below |
| `pinna` | rings of ±45° gabors that counter-rotate while only breathing | pinna & brelstaff 2000; gurnsey & pagé 2006 |

crossfades between looks are morphs (`uLookMix` blends two full field
evaluations), so a mood change is never a cut.

## the vision look — the hallucination engine

the capstone, and the only look here that is *derived* rather than
designed. in 1926 klüver catalogued what people actually see on
mescaline and found four recurring geometries: lattices/honeycombs,
cobwebs, tunnels/funnels, spirals. he called them form constants and
could not explain them. ermentrout & cowan did, in 1979.

V1 sees the visual field through a complex logarithm (with a foveal
shoulder — see below). a point at radius r, angle θ in the eye lands
near (log r, θ) on the flat cortical sheet. when excitation destabilizes — which is what a 5-HT2A
agonist does to the excitation/inhibition balance — the sheet does
what every reaction-diffusion system does: it forms stripes. plain,
straight, boring cortical stripes.

seen back through the inverse map, those stripes are the form
constants. one angle α sweeps the entire taxonomy:

| cortical stripe | visual field | klüver class |
|---|---|---|
| α = 0 (varies with log r) | concentric rings | the tunnel |
| α = π/2 (varies with θ) | radial spokes | the funnel |
| 0 < α < π/2 | log spiral, pitch **exactly tan α** | the spiral |
| three stripes at 120° | honeycomb | the lattice |

the spiral pitch falls straight out of the algebra: constant phase
means cos α·log r + sin α·θ = c, so r = A·e^(−tan α·θ).

the look walks α on a slow cosine so the iris travels the taxonomy
rather than picking one hallucination, and folds the hexagonal
planform in and out on a slower cycle. riding on top is kitaoka's
peripheral-drift staircase — the asymmetric black→dark→white→light
luminance ramp whose contrast-dependent latency the visual system
reads as motion in a static image — phase-locked to the planform, so
the illusory drift runs *along* the form constant's contours.

the tests don't check that it looks trippy; they check the
derivation. α=0 is constant on every circle. α=π/2 is constant along
every ray and has exactly k spokes (counted by zero crossings).
intermediate α holds phase along r = A·e^(−tan α·θ). the map turns
scaling into translation, and time translation equals radial scaling
— which is *why* the tunnel never arrives.

## the cords (`cord.ts`)

the eyes are not floating; they are fed. a tapered tube per eye
curves out of the socket and down into the dark, carrying a
peristaltic bulge travelling toward the eye and a sway gripped at the
socket (grip = u², so the far end drifts while the attachment never
tears loose). flesh shader: lengthwise veins wandering under fbm
mottling, a key light so the tube has a lit and a dark side, wet
specular, rim, and a fade that swallows the far end rather than
cutting it off. geometry is built once; both motions run in the
vertex shader, with CPU twins in `math.ts` so the motion is testable.

## motion modes

gaze is a budget, split between turning the eye **body** and sliding
the **pupil** (`splitGaze`). `pupil` spends it all on the pupil — the
decal look. `eye` spends it all on the body — doll eyes. `both`
(default, 0.55 body share) splits it, and the body lerps slower than
the pupil, so the pupil arrives first and the body follows. that lag
is most of what reads as alive.

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

four suites over the pure TS mirrors in `math.ts` — `leyebrary-math`
(fields), `leyebrary-trip` (mandala/feedback/grade), `leyebrary-
anatomy` (gaze split + cords), `leyebrary-vision` (the form-constant
derivation) — 91 assertions total. the earlier suites cover: palette gamut and
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

## SAFETY: do not add flicker to this (2026-08-06)

the research turned up the frequencies at which flicker maximally
induces geometric hallucinations: radial forms peak at **9.2 ± 2.7
Hz**, spirals at **15.1 ± 2.0 Hz** (mauro, raffone & vanrullen 2015,
J Neurosci 35:7921); 10 Hz flicker produces "elementary imagery"
ratings statistically indistinguishable from **100 µg of LSD**
(bartossek 2021).

that is a tempting feature and it must not be built. **8–25 Hz
full-field luminance flicker is the photosensitive-epilepsy
provocation band**, worst around 15–20 Hz — exactly the range that
works best. this installation is for a crowd, at night, on
psychedelics, with no screening and no warning signage. the pattern
motion here is deliberately kept slow (the drift illusion's own
measured speed is **0.15–1 °/s**), and no look modulates whole-field
luminance at rates above ~2 Hz.

if anyone later wants the frequency-selectivity result in the piece,
express it as *spatial* structure — which form constant is showing —
never as temporal flicker.

## the pinna look

concentric rings of gabor elements tilted ±45° to the radius. nothing
rotates: the rings only breathe ±10%. but the motion system can only
recover the component of motion normal to each element's orientation
(the aperture problem), so looming acquires a rotary component with no
attributable cause — and neighbouring rings appear to counter-rotate
against each other. pinna & brelstaff 2000; gurnsey & pagé 2006
measured the tuning (peak at 70–95° inter-ring difference, so ±45° is
right) and, crucially, found the illusion is **as strong or stronger
from on-screen scaling than from the observer physically moving**,
because screen motion is smoother. that is the permission slip for
doing it in a shader.

two things kill it, both of which look harmless: half-wave rectifying
the element, and swapping the gaussian envelope for a hard circular
aperture. both broaden the spatial-frequency bandwidth, and the
aperture problem is only unsolvable for narrowband patterns. the
field is therefore signed about mid-grey and never clamped — and
there is a test that fails if anyone clamps it.

## unfinished research (2026-08-06)

two deep-research passes were commissioned and did NOT complete — the
session's web-search budget ran out mid-flight and both agents were
killed. everything in the vision look is from literature stated
precisely enough to implement and test (klüver's four classes,
ermentrout & cowan's log map and stripe→form-constant result, the
schwartz retino-cortical formula, kitaoka's drift staircase), but the
following were NOT verified against sources this session and should
be checked before anyone treats them as settled:

- ~~the drift staircase stops~~ RESOLVED: conway et al. 2005 measured
  both ordering and luminances (black <1, dark grey 30, white 70,
  light grey 40 cd/m² on a 35 cd/m² ground). `DRIFT_STOPS` now carries
  the measured ratios.
- documented breathing frequency / amplitude in real phenomenology —
  `BREATH.freq = 0.21 Hz` is chosen by eye, not measured
- the bressloff-cowan-golubitsky (2001) extension: orientation
  preference, contoured planforms, cobwebs. not implemented at all.
  (their retino-cortical map IS now used — the foveal-shoulder form
  with w0/eps = 1.7 degrees — but the orientation-hypercolumn
  machinery is not.)
- whether any of these illusions are measurably *enhanced* under
  psychedelics, vs. assumed

## backlog

- gray-scott reaction-diffusion iris (F=0.0545, k=0.062, seeded from
  the limbal ring) — highest awe, needs its own ping-pong pair.
- julia orbit-trap look, c orbiting the 0.7885 circle.
- beat-locked drift (the avs beatdiv idiom) once the booth has a
  pulse/tempo signal worth locking to.
- feedback ink mode per look (trails currently inks with the spiral).
- low-res nearest-neighbor base + full-res glow compositing (the full
  inscryption down-rez).
