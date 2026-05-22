// Turtle mascot — loggerhead sea turtle with an animated green gradient
// painted onto the skin, warm-white glowing eyes with black pupils, and
// a comical warp-in entrance after a brief delay. Drifts on a Lissajous
// wander that includes a depth-illusion "breath" (scale modulation
// since the camera is orthographic) and banks into the offset.
//
// Debug rotation control: when the DEBUG chip is on, arrow keys spin the
// turtle live, current rotation prints in the debug overlay. Find the
// orientation you want, copy the values, and bake them into BASE_ROTATION
// below.
//
// Implements the Mascot interface in ./types.ts so the scene can swap
// it with any other mascot (the cat, future-mascots) without changes
// elsewhere.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { publishDebug, clearDebug } from '../../../debug/debugBus';
import { subscribeDebugVisible } from '../../../debug/visibilityStorage';
import type { Mascot, MascotContext } from './types';

const ASSET_URL = '/mascots/turtle/scene.gltf';
const EYE_COLOR = 0xfff7e0;            // warm white — pops inside the silhouette
const EYE_MESH_NAME = 'Object_38';     // the smaller skinned mesh in the gltf
const ANIMATION_TIME_SCALE = 0.2;      // 5× slower than native — calm paddle
const TURTLE_SCALE = 2.0;              // 2× larger than the anchor footprint
// Push back in local Z. With group.scale=2 and the rig's ~100 px/unit
// scale on top, Z_OFFSET=-1.0 puts him ~200 world units behind the
// rig anchor — well clear of the camera's near plane (at z=99.9) even
// when bank-tilt swings part of the model forward.
const Z_OFFSET = -1.0;

// ↓↓↓ BAKED ORIENTATION — edit this after dialing in via debug arrows. ↓↓↓
// Order: (x, y, z) in radians.
const BASE_ROTATION = new THREE.Euler(0, Math.PI, 0);
// ↑↑↑

// Animated green gradient — flows over the skin in model space, so it
// stays glued to the body as the bones animate (rather than slipping
// as he wanders through world space). Two greens lerped by a sine of
// position.y + uTime; speed and band density tunable here.
const GRADIENT_DEEP = new THREE.Color(0x041e0e);   // deep shadow — adds depth on under-facing facets
const GRADIENT_DARK = new THREE.Color(0x0a3818);   // deep moss
const GRADIENT_LIGHT = new THREE.Color(0x3a9a4a);  // medium green — peak no longer triggers bloom blowout
const GRADIENT_BAND_FREQ = 4.0;     // bands per unit of local Y — higher = tighter stripes
const GRADIENT_SPEED = 0.375;       // rad/sec — slow flow (¼ of the original 1.5)
// Faceted "low-poly" shading: per-triangle normal via screen-space
// derivatives. Modulates brightness so adjacent facets read distinct
// without changing the geometry. Range tuned to feel sculptural, not
// blocky.
// (Hex grid overlay was tried and rolled back — read as "watermelon"
//  instead of "tortoise shell". Kept the gradient + facet shading.)
const FACET_STRENGTH = 0.22;         // 0 = flat smooth (legacy), 1 = max contrast between facets

// Disintegration tuning. The toe-to-head wave sweeps `dissolveCutoffY`
// from minY to maxY over DISINTEGRATE_WAVE_S; particles activate as
// the wave reaches their local Y. After the wave finishes, particles
// continue floating + fading for PARTICLE_LIFE_S more.
const DISINTEGRATE_PARTICLE_COUNT = 900;
const DISINTEGRATE_WAVE_S = 1.6;          // toe-to-head sweep time
const PARTICLE_LIFE_S = 1.8;              // per-particle drift+fade duration (disintegrate)
const PARTICLE_UPWARD_VEL_MIN = 0.25;
const PARTICLE_UPWARD_VEL_MAX = 0.95;
const PARTICLE_LATERAL_VEL = 0.45;
const PARTICLE_GRAVITY = 0.18;            // downward drag — particles slow at peak
const PARTICLE_BASE_SIZE_PX = 4.5;

// Materialize (reverse-disintegrate) tuning. Particles start at scattered
// positions, drift to their vertex targets while the dissolve cutoff sweeps
// up. Body fragments appear toe-to-head as the wave passes.
const MATERIALIZE_PARTICLE_COUNT = 900;
const MATERIALIZE_WAVE_S = 1.6;
const MATERIALIZE_PARTICLE_LIFE_S = 1.1;
const MATERIALIZE_SCATTER_DIST_MIN = 30;
const MATERIALIZE_SCATTER_DIST_RANGE = 70;
const MATERIALIZE_SCATTER_HEIGHT_MIN = 15;
const MATERIALIZE_SCATTER_HEIGHT_RANGE = 45;

// Wander shape — two incommensurate frequencies so the path never closes.
// Amplitudes in positionGroup-local units (rig is ~100 px/unit), so
// ±30px / ±20px of drift on screen at rest scale.
const WANDER_X_AMP = 0.30;
const WANDER_Y_AMP = 0.20;
const WANDER_X_FREQ = 0.50;   // rad/sec
const WANDER_Y_FREQ = 0.37;

// ─── Focus-point tilt ────────────────────────────────────
// Instead of tilting INTO the wander direction (which read as a
// swing / pendulum), the turtle aims its head at a slowly-drifting
// focus point near the camera origin. As it wanders, the head
// stays approximately pointed at the user — the head appears
// "locked on" with subtle natural drift, not swinging.
//
// Focus drifts on a low-amplitude Lissajous around (0, 0). Two
// incommensurate frequencies so the path never closes.
const FOCUS_X_AMP = 0.18;
const FOCUS_Y_AMP = 0.12;
const FOCUS_X_FREQ = 0.11;    // rad/sec — much slower than wander
const FOCUS_Y_FREQ = 0.07;
// Gain mapping (focus - position) → tilt radians. Larger = more
// aggressive look-at lock. At 0.85 the turtle visibly tracks the
// focus through its wander without ever feeling stuck.
const FOCUS_TILT_GAIN = 0.85;

// Depth-illusion "breath" — since the main camera is orthographic, a
// pure Z translation doesn't change apparent size, so we modulate the
// group scale instead. Slow + low-amp so it reads as "swimming a bit
// closer / a bit farther" rather than as pulsing.
const BREATH_AMP = 0.06;      // ±6% of TURTLE_SCALE
const BREATH_FREQ = 0.19;     // rad/sec — slowest of the three drives

// Bank-tilt: radians of tilt per unit of wander offset. With max wander
// of 0.30, that's ~17° tilt at the extreme — readable but not goofy.
// (TILT_PER_UNIT removed — superseded by FOCUS_TILT_GAIN, which maps
//  the focus-vs-position offset to tilt instead of tilting INTO the
//  wander direction. The old behavior read as a pendulum swing.)

// Debug rotation: arrow-key increment (radians). ~5.7° per press.
const DEBUG_ROT_STEP = 0.1;

// Entrance: brief delay so the stars settle in first, then the
// materialize animation runs (~waveStart + waveDuration ≈ 2.7s).
const ENTRY_DELAY = 0.6;      // seconds — wait for stars to be visible
// (ENTRY_DURATION removed — replaced by MATERIALIZE_WAVE_S + MATERIALIZE_PARTICLE_LIFE_S.)

export function createTurtleMascot(): Mascot {
  const group = new THREE.Group();
  group.visible = false;

  // Tilt container — sits between `group` (which holds the wander
  // translation) and `root` (which holds the face-camera baseline).
  // Tilting this container applies the bank in world-aligned axes,
  // which composes cleanly with the head-toward-camera Y rotation
  // baked into root.
  const tiltGroup = new THREE.Group();
  tiltGroup.position.z = Z_OFFSET;
  group.add(tiltGroup);

  // Dissolve uniforms — shared between body + eye materials.
  //   uDissolveCutoffY: local-Y cutoff for the wave.
  //   uDissolveMode:    0 = disintegrate (frags with y < cutoff get discarded;
  //                          sweep low→high erases toe-first).
  //                     1 = materialize (frags with y > cutoff get discarded;
  //                          sweep low→high reveals toe-first).
  // Initial state is materialize-invisible: mode=1, cutoff well below minY,
  // so every fragment has y > cutoff → all discarded → mascot invisible
  // until startMaterialize() ramps the cutoff up.
  const dissolveUniform = { value: -1e9 };
  const dissolveModeUniform = { value: 1.0 };

  // Eye glow — applied in place of the gltf's eye material so the turtle
  // has visible eyes even when the body uses the original PBR skin.
  // depthTest=false so the eyes draw THROUGH the head silhouette — the
  // eye mesh sits inside the eye sockets and would otherwise be occluded.
  const eyeMat = new THREE.MeshBasicMaterial({
    color: EYE_COLOR,
    depthTest: false,
  });
  eyeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolveCutoffY = dissolveUniform;
    shader.uniforms.uDissolveMode = dissolveModeUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLocalPosEye;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLocalPosEye = position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uDissolveCutoffY;\nuniform float uDissolveMode;\nvarying vec3 vLocalPosEye;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nif (uDissolveMode < 0.5) { if (vLocalPosEye.y < uDissolveCutoffY) discard; } else { if (vLocalPosEye.y > uDissolveCutoffY) discard; }',
      );
  };

  // Body skin — MeshBasicMaterial patched via onBeforeCompile so we get
  // built-in skinning vertex chunks for free, then override the
  // fragment color with an animated gradient driven by a shared uTime
  // uniform. CPU cost per frame = one uniform write; GPU cost is a
  // single sin + mix per fragment.
  const bodyTimeUniform = { value: 0 };
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  bodyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = bodyTimeUniform;
    shader.uniforms.uGradDeep = { value: GRADIENT_DEEP };
    shader.uniforms.uGradDark = { value: GRADIENT_DARK };
    shader.uniforms.uGradLight = { value: GRADIENT_LIGHT };
    shader.uniforms.uBandFreq = { value: GRADIENT_BAND_FREQ };
    shader.uniforms.uSpeed = { value: GRADIENT_SPEED };
    shader.uniforms.uFacetStrength = { value: FACET_STRENGTH };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLocalPos;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLocalPos = position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform vec3 uGradDeep;
         uniform vec3 uGradDark;
         uniform vec3 uGradLight;
         uniform float uBandFreq;
         uniform float uSpeed;
         uniform float uFacetStrength;
         uniform float uDissolveCutoffY;
         uniform float uDissolveMode;
         varying vec3 vLocalPos;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         if (uDissolveMode < 0.5) {
           if (vLocalPos.y < uDissolveCutoffY) discard;
         } else {
           if (vLocalPos.y > uDissolveCutoffY) discard;
         }

         // ── Base gradient (3-color ramp) ──
         // Existing horizontal bands, ramping through a deeper shadow
         // color at the troughs so under-belly facets feel recessed
         // and the lit side reads bright by contrast.
         float wave = sin(vLocalPos.y * uBandFreq + uTime * uSpeed) * 0.5 + 0.5;
         vec3 base = wave < 0.5
           ? mix(uGradDeep, uGradDark, wave * 2.0)
           : mix(uGradDark, uGradLight, (wave - 0.5) * 2.0);

         // ── Faceted shading via screen-space derivatives ──
         // dFdx/dFdy of vLocalPos are constant across each rasterized
         // triangle, so their cross product is the per-facet normal in
         // local space. We use the y-component as a cheap "lit from
         // above" lambert proxy — purely cosmetic since there's no
         // real light source.
         vec3 facetN = normalize(cross(dFdx(vLocalPos), dFdy(vLocalPos)));
         float facetShade = 1.0 - uFacetStrength * (0.5 - clamp(facetN.y * 0.5 + 0.5, 0.0, 1.0));
         base *= facetShade;

         diffuseColor.rgb = base;`,
      );
    shader.uniforms.uDissolveCutoffY = dissolveUniform;
    shader.uniforms.uDissolveMode = dissolveModeUniform;
  };

  // Live rotation — starts at BASE_ROTATION, mutated by debug arrow keys.
  // root.rotation is kept in sync so what you see is what gets reported.
  const liveRotation = BASE_ROTATION.clone();
  let rootRef: THREE.Object3D | null = null;
  let debugVisible = false;

  // ─── Disintegrate / Materialize state ───────────────────
  // The mascot has two particle effects sharing one pool shape:
  //   - DISINTEGRATE: vertex positions → outward velocity → drift + fade.
  //     dissolve mode 0; cutoff sweeps low→high; toe-fragments hide first.
  //   - MATERIALIZE: scattered origin → vertex target → arrive + fade.
  //     dissolve mode 1; cutoff sweeps low→high; toe-fragments reveal first.
  //
  // ParticleData carries both `origins` (start positions) and (optional)
  // `targets` (end positions for materialize). Disintegrate uses origins
  // + velocities; materialize uses origins + targets.
  let disintegrating = false;
  let disintegrateStartT = -1;
  let disintegrateDone = false;
  let disintegrateOnDone: (() => void) | null = null;
  // Materialize state — runs once on first show, replaces the legacy warp-in.
  let materializing = false;
  let materializeStartT = -1;
  let materializeDone = false;
  let materializeEndT = -1;            // sets the wander/breath time origin
  type ParticleData = {
    geom: THREE.BufferGeometry;
    mat: THREE.PointsMaterial;
    points: THREE.Points;
    positions: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    origins: Float32Array;          // initial XYZ per particle
    velocities: Float32Array;       // initial XYZ velocity (disintegrate)
    activationT: Float32Array;      // seconds-since-trigger when particle wakes
    targets: Float32Array | null;   // end positions (materialize); null for disintegrate
    bodyMinY: number;
    bodyMaxY: number;
  };
  let particleData: ParticleData | null = null;

  // Entry timing — captured the first frame the mascot is visible. The
  // entrance is delay → warp-in → normal (wander/breath/tilt).
  let firstSeenT = -1;

  const mixer: { value: THREE.AnimationMixer | null } = { value: null };
  let mixerAction: THREE.AnimationAction | null = null;
  const disposables: Array<{ dispose: () => void }> = [eyeMat, bodyMat];

  function publishRotation(): void {
    publishDebug('turtle.rotX', formatRot(liveRotation.x));
    publishDebug('turtle.rotY', formatRot(liveRotation.y));
    publishDebug('turtle.rotZ', formatRot(liveRotation.z));
  }

  function onKey(e: KeyboardEvent): void {
    if (!debugVisible) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    let handled = false;
    switch (e.key) {
      case 'ArrowLeft':  liveRotation.y -= DEBUG_ROT_STEP; handled = true; break;
      case 'ArrowRight': liveRotation.y += DEBUG_ROT_STEP; handled = true; break;
      case 'ArrowUp':    liveRotation.x -= DEBUG_ROT_STEP; handled = true; break;
      case 'ArrowDown':  liveRotation.x += DEBUG_ROT_STEP; handled = true; break;
      case '[':          liveRotation.z -= DEBUG_ROT_STEP; handled = true; break;
      case ']':          liveRotation.z += DEBUG_ROT_STEP; handled = true; break;
    }
    if (handled) {
      e.preventDefault();
      if (rootRef) rootRef.rotation.copy(liveRotation);
      publishRotation();
    }
  }
  window.addEventListener('keydown', onKey);

  const unsubDebug = subscribeDebugVisible((v) => {
    debugVisible = v;
    if (v) publishRotation();
    else {
      clearDebug('turtle.rotX');
      clearDebug('turtle.rotY');
      clearDebug('turtle.rotZ');
    }
  });

  const ready = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      ASSET_URL,
      (gltf) => {
        const root = gltf.scene;

        // Normalize: center on origin + scale longest axis to 1. The
        // rig applies anchor.width on top. CRITICAL: three.js composes
        // localMatrix as T * R * S, so the position offset is applied
        // BEFORE the scale shrinks the geometry. Pre-divide the offset
        // by maxDim so it scales with the geometry instead of leaving
        // the model translated by ~20 units (which would put it behind
        // the camera once the rig ramps to its steady-state scale).
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.set(
          -center.x / maxDim,
          -center.y / maxDim,
          -center.z / maxDim,
        );
        root.scale.setScalar(1 / maxDim);

        // Body meshes get the animated-gradient material; eye mesh gets
        // the warm-white glow. Original gltf materials are disposed
        // since we're replacing them all.
        root.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (!m.isMesh) return;
          const orig = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(orig)) orig.forEach((mat) => mat.dispose?.());
          else orig?.dispose?.();
          if (m.name === EYE_MESH_NAME) {
            m.material = eyeMat;
            m.renderOrder = 10;
          } else {
            m.material = bodyMat;
          }
          m.castShadow = false;
          m.receiveShadow = false;
          m.frustumCulled = false;
          if (m.geometry) disposables.push(m.geometry);
        });

        // Apply the live rotation (default = BASE_ROTATION, mutable by
        // debug arrow keys).
        root.rotation.copy(liveRotation);
        tiltGroup.add(root);
        rootRef = root;
        if (debugVisible) publishRotation();

        // Final size set inside the update() — we modulate scale every
        // frame for the breath effect + the warp-in entrance.
        group.scale.setScalar(0);

        if (gltf.animations.length > 0) {
          mixer.value = new THREE.AnimationMixer(root);
          const clip = gltf.animations[0];
          if (clip) {
            mixerAction = mixer.value.clipAction(clip);
            mixerAction.play();
            mixer.value.timeScale = ANIMATION_TIME_SCALE;
          }
        }

        group.visible = true;
        resolve();
      },
      undefined,
      (err) => {
        console.warn('[turtleMascot] load failed:', err);
        reject(err);
      },
    );
  });

  /** Sample bind-pose vertex positions across all body meshes. Returns
   *  an array of { localPos, color } items. Color is generated from the
   *  body gradient (sampled at the vertex's local Y) so each particle
   *  matches the moss-to-medium-green palette the body uses. */
  function sampleBodyVertices(root: THREE.Object3D): Array<{
    p: THREE.Vector3;
    c: THREE.Color;
  }> {
    const samples: Array<{ p: THREE.Vector3; c: THREE.Color }> = [];
    root.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.name === EYE_MESH_NAME) return;       // skip eye mesh
      const posAttr = m.geometry?.attributes?.position;
      if (!posAttr) return;
      const stride = Math.max(1, Math.floor(posAttr.count / 200));
      const tmp = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i += stride) {
        tmp.fromBufferAttribute(posAttr, i);
        // Color picked from the gradient — same wave as the body shader,
        // sampled at t=0 (don't bother phasing).
        const wave = Math.sin(tmp.y * GRADIENT_BAND_FREQ) * 0.5 + 0.5;
        const c = GRADIENT_DARK.clone().lerp(GRADIENT_LIGHT, wave);
        samples.push({ p: tmp.clone(), c });
      }
    });
    return samples;
  }

  function startDisintegrate(onDone: () => void): void {
    if (disintegrating || !rootRef) {
      // No turtle yet (still loading), or already going — fire onDone so
      // the caller's flow doesn't stall.
      onDone();
      return;
    }
    disintegrating = true;
    disintegrateStartT = -1;
    disintegrateDone = false;
    disintegrateOnDone = onDone;
    // Switch dissolve to disintegrate mode (frags below cutoff die).
    dissolveModeUniform.value = 0;
    if (mixer.value) mixer.value.stopAllAction();

    // Sample bind-pose vertices in the turtle's LOCAL space (root). Cap
    // to DISINTEGRATE_PARTICLE_COUNT; if there are more, downsample
    // uniformly across the list so we don't lose distribution.
    const samples = sampleBodyVertices(rootRef);
    let chosen = samples;
    if (samples.length > DISINTEGRATE_PARTICLE_COUNT) {
      const step = samples.length / DISINTEGRATE_PARTICLE_COUNT;
      chosen = [];
      for (let i = 0; i < DISINTEGRATE_PARTICLE_COUNT; i++) {
        chosen.push(samples[Math.floor(i * step)]!);
      }
    }
    const count = chosen.length;
    if (count === 0) { onDone(); disintegrating = false; return; }

    // Min/max local Y — drives the toe-to-head sweep range.
    let minY = +Infinity;
    let maxY = -Infinity;
    for (const s of chosen) {
      if (s.p.y < minY) minY = s.p.y;
      if (s.p.y > maxY) maxY = s.p.y;
    }
    const spanY = Math.max(1e-6, maxY - minY);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const origins = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const activationT = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const s = chosen[i]!;
      // Transform local → root-space position. rootRef is attached to
      // tiltGroup; both contribute. We want particles emitted in the
      // SAME frame as `root` so they ride along with the wander/tilt
      // until activation. Use the local position directly — the Points
      // object will be parented to `root`.
      origins[i * 3 + 0] = s.p.x;
      origins[i * 3 + 1] = s.p.y;
      origins[i * 3 + 2] = s.p.z;
      positions[i * 3 + 0] = s.p.x;
      positions[i * 3 + 1] = s.p.y;
      positions[i * 3 + 2] = s.p.z;
      colors[i * 3 + 0] = s.c.r;
      colors[i * 3 + 1] = s.c.g;
      colors[i * 3 + 2] = s.c.b;
      sizes[i] = 0;
      // Velocity: outward XZ burst + upward Y bias. Some randomness so
      // particles don't all rise in lockstep.
      const ang = Math.random() * Math.PI * 2;
      const radial = (0.3 + Math.random() * 0.7) * PARTICLE_LATERAL_VEL;
      velocities[i * 3 + 0] = Math.cos(ang) * radial;
      velocities[i * 3 + 1] = PARTICLE_UPWARD_VEL_MIN +
        Math.random() * (PARTICLE_UPWARD_VEL_MAX - PARTICLE_UPWARD_VEL_MIN);
      velocities[i * 3 + 2] = Math.sin(ang) * radial;
      // Activation time = wave reaches this particle's local Y.
      const tY = (s.p.y - minY) / spanY;        // 0 at toes, 1 at head
      // Small jitter so particles within the same Y band don't all
      // activate exactly at once.
      activationT[i] = tY * DISINTEGRATE_WAVE_S + (Math.random() - 0.5) * 0.06;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // PointsMaterial doesn't support per-vertex size as an attribute, so
    // we use a single size and rely on per-particle scale via making the
    // position-into-camera trick irrelevant (sizeAttenuation true gives
    // distance fade). Per-particle alpha is baked into the color
    // (premultiplied feel) via the additive blend.
    const mat = new THREE.PointsMaterial({
      size: PARTICLE_BASE_SIZE_PX,
      sizeAttenuation: false,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    rootRef.add(points);
    particleData = {
      geom, mat, points,
      positions, colors, sizes, origins, velocities, activationT,
      targets: null,
      bodyMinY: minY,
      bodyMaxY: maxY,
    };
  }

  // ─── Materialize (reverse-disintegrate) ────────────────────
  // Mirror of startDisintegrate: particles start scattered, drift inward
  // to vertex targets, fade as they arrive. Body fragments appear toe-
  // to-head as the dissolve cutoff sweeps up (mode 1). Total visual
  // duration ≈ MATERIALIZE_PARTICLE_LIFE_S + MATERIALIZE_WAVE_S.
  function startMaterialize(): void {
    if (materializing || materializeDone || !rootRef) return;
    materializing = true;
    materializeStartT = -1;
    materializeDone = false;

    // Materialize mode + cutoff well BELOW minY → fragments with y > cutoff
    // are discarded → everything starts invisible. The update ramps cutoff
    // upward to reveal toe-first.
    dissolveModeUniform.value = 1.0;
    dissolveUniform.value = -1e9;
    group.scale.setScalar(TURTLE_SCALE);
    group.position.set(0, 0, 0);
    tiltGroup.rotation.x = 0;
    tiltGroup.rotation.z = 0;

    const samples = sampleBodyVertices(rootRef);
    let chosen = samples;
    if (samples.length > MATERIALIZE_PARTICLE_COUNT) {
      const step = samples.length / MATERIALIZE_PARTICLE_COUNT;
      chosen = [];
      for (let i = 0; i < MATERIALIZE_PARTICLE_COUNT; i++) {
        chosen.push(samples[Math.floor(i * step)]!);
      }
    }
    const count = chosen.length;
    if (count === 0) {
      // No body data — instant finish.
      dissolveUniform.value = 1e9;
      materializing = false;
      materializeDone = true;
      materializeEndT = 0;
      return;
    }

    let minY = +Infinity;
    let maxY = -Infinity;
    for (const s of chosen) {
      if (s.p.y < minY) minY = s.p.y;
      if (s.p.y > maxY) maxY = s.p.y;
    }
    const spanY = Math.max(1e-6, maxY - minY);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const origins = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);     // unused for materialize
    const activationT = new Float32Array(count);
    const targets = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const s = chosen[i]!;
      const tx = s.p.x, ty = s.p.y, tz = s.p.z;
      // Scattered origin: random direction in XZ, height offset above target.
      const ang = Math.random() * Math.PI * 2;
      const dist = MATERIALIZE_SCATTER_DIST_MIN + Math.random() * MATERIALIZE_SCATTER_DIST_RANGE;
      const heightOffset = MATERIALIZE_SCATTER_HEIGHT_MIN + Math.random() * MATERIALIZE_SCATTER_HEIGHT_RANGE;
      const ox = tx + Math.cos(ang) * dist;
      const oy = ty + heightOffset;
      const oz = tz + Math.sin(ang) * dist;
      origins[i * 3 + 0] = ox;
      origins[i * 3 + 1] = oy;
      origins[i * 3 + 2] = oz;
      targets[i * 3 + 0] = tx;
      targets[i * 3 + 1] = ty;
      targets[i * 3 + 2] = tz;
      positions[i * 3 + 0] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
      colors[i * 3 + 0] = 0;
      colors[i * 3 + 1] = 0;
      colors[i * 3 + 2] = 0;
      sizes[i] = 0;
      // Activation timed so the particle ARRIVES at its target the moment
      // the wave reveals the body fragment there. waveStart =
      // PARTICLE_LIFE_S gives the toe particles their full lifetime before
      // the wave begins. Earliest activation = 0 (toe); latest = wave end.
      const tY = (ty - minY) / spanY;
      const arrivalT = MATERIALIZE_PARTICLE_LIFE_S + tY * MATERIALIZE_WAVE_S;
      activationT[i] = Math.max(0, arrivalT - MATERIALIZE_PARTICLE_LIFE_S)
        + (Math.random() - 0.5) * 0.05;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: PARTICLE_BASE_SIZE_PX,
      sizeAttenuation: false,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    rootRef.add(points);
    particleData = {
      geom, mat, points,
      positions, colors, sizes, origins, velocities, activationT,
      targets,
      bodyMinY: minY,
      bodyMaxY: maxY,
    };
  }

  function updateMaterialize(ctx: MascotContext): void {
    if (!materializing || !particleData || !particleData.targets) return;
    if (materializeStartT < 0) materializeStartT = ctx.t;
    const elapsed = ctx.t - materializeStartT;

    const pd = particleData;
    const targets = pd.targets!;
    const count = pd.activationT.length;
    const spanY = pd.bodyMaxY - pd.bodyMinY;

    // Wave: cutoff sweeps up from below minY to above maxY. Delayed by
    // PARTICLE_LIFE_S so the toe particle has time to arrive first.
    const waveT = (elapsed - MATERIALIZE_PARTICLE_LIFE_S) / MATERIALIZE_WAVE_S;
    if (waveT < 0) {
      dissolveUniform.value = pd.bodyMinY - 1;
    } else if (waveT < 1) {
      dissolveUniform.value = pd.bodyMinY + waveT * spanY * 1.02;
    } else {
      dissolveUniform.value = pd.bodyMaxY + 100;
    }

    let alive = 0;
    for (let i = 0; i < count; i++) {
      const act = pd.activationT[i]!;
      if (elapsed < act) {
        pd.colors[i * 3 + 0] = 0;
        pd.colors[i * 3 + 1] = 0;
        pd.colors[i * 3 + 2] = 0;
        continue;
      }
      const partAge = elapsed - act;
      if (partAge >= MATERIALIZE_PARTICLE_LIFE_S) {
        pd.colors[i * 3 + 0] = 0;
        pd.colors[i * 3 + 1] = 0;
        pd.colors[i * 3 + 2] = 0;
        continue;
      }
      alive += 1;
      const t = partAge / MATERIALIZE_PARTICLE_LIFE_S;
      // Ease-in-out cubic for organic drift.
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const ox = pd.origins[i * 3 + 0]!;
      const oy = pd.origins[i * 3 + 1]!;
      const oz = pd.origins[i * 3 + 2]!;
      const tx = targets[i * 3 + 0]!;
      const ty = targets[i * 3 + 1]!;
      const tz = targets[i * 3 + 2]!;
      pd.positions[i * 3 + 0] = ox + (tx - ox) * eased;
      pd.positions[i * 3 + 1] = oy + (ty - oy) * eased;
      pd.positions[i * 3 + 2] = oz + (tz - oz) * eased;

      // Color: bright ember at start, settles into the body's green
      // gradient color near arrival, fades to 0 at arrival (handing off
      // visibility to the just-revealed body fragment).
      const ember = Math.max(0, 1 - t * 1.5);
      const fade = Math.max(0, 1 - Math.pow(t, 1.4));
      const ly = ty;
      const wave = Math.sin(ly * GRADIENT_BAND_FREQ) * 0.5 + 0.5;
      const baseR = GRADIENT_DARK.r * (1 - wave) + GRADIENT_LIGHT.r * wave;
      const baseG = GRADIENT_DARK.g * (1 - wave) + GRADIENT_LIGHT.g * wave;
      const baseB = GRADIENT_DARK.b * (1 - wave) + GRADIENT_LIGHT.b * wave;
      const r = (baseR + ember * (1 - baseR)) * fade;
      const g = (baseG + ember * (0.9 - baseG)) * fade;
      const b = (baseB + ember * (0.6 - baseB)) * fade;
      pd.colors[i * 3 + 0] = Math.max(0, r);
      pd.colors[i * 3 + 1] = Math.max(0, g);
      pd.colors[i * 3 + 2] = Math.max(0, b);
    }
    pd.geom.attributes.position.needsUpdate = true;
    pd.geom.attributes.color.needsUpdate = true;

    // Done: wave finished AND no particles still alive.
    const waveOver = waveT >= 1;
    if (waveOver && alive === 0) {
      materializeDone = true;
      materializing = false;
      materializeEndT = ctx.t;
      // Cleanup particle pool.
      if (rootRef && pd.points.parent === rootRef) rootRef.remove(pd.points);
      pd.geom.dispose();
      pd.mat.dispose();
      particleData = null;
      // Body fully visible — switch back to disintegrate-mode defaults
      // so a future disintegration call works straightforwardly (cutoff
      // well below minY, mode 0).
      dissolveModeUniform.value = 0;
      dissolveUniform.value = -1e9;
    }
  }

  function updateDisintegrate(ctx: MascotContext): void {
    if (!disintegrating || !particleData) return;
    if (disintegrateStartT < 0) disintegrateStartT = ctx.t;
    const elapsed = ctx.t - disintegrateStartT;

    const pd = particleData;
    const count = pd.activationT.length;

    // Wave sweeps the dissolve cutoff from below-minY to above-maxY over
    // DISINTEGRATE_WAVE_S. Add a small overshoot so the very last
    // fragments definitely discard.
    const waveT = Math.min(1, elapsed / DISINTEGRATE_WAVE_S);
    const sweepRange = pd.bodyMaxY - pd.bodyMinY;
    dissolveUniform.value = pd.bodyMinY + waveT * sweepRange * 1.02;

    // Update particles. Each that has activated advances its drift + fade.
    let aliveCount = 0;
    for (let i = 0; i < count; i++) {
      const act = pd.activationT[i]!;
      if (elapsed < act) {
        // Not yet active. Stay anchored at origin, invisible.
        pd.colors[i * 3 + 0] = 0;
        pd.colors[i * 3 + 1] = 0;
        pd.colors[i * 3 + 2] = 0;
        continue;
      }
      const partAge = elapsed - act;
      if (partAge >= PARTICLE_LIFE_S) {
        // Particle dead — keep it invisible.
        pd.colors[i * 3 + 0] = 0;
        pd.colors[i * 3 + 1] = 0;
        pd.colors[i * 3 + 2] = 0;
        continue;
      }
      aliveCount += 1;
      // Position: ballistic — origin + v*t - 0.5*g*t² on Y.
      const ox = pd.origins[i * 3 + 0]!;
      const oy = pd.origins[i * 3 + 1]!;
      const oz = pd.origins[i * 3 + 2]!;
      const vx = pd.velocities[i * 3 + 0]!;
      const vy = pd.velocities[i * 3 + 1]!;
      const vz = pd.velocities[i * 3 + 2]!;
      pd.positions[i * 3 + 0] = ox + vx * partAge;
      pd.positions[i * 3 + 1] = oy + vy * partAge - 0.5 * PARTICLE_GRAVITY * partAge * partAge;
      pd.positions[i * 3 + 2] = oz + vz * partAge;
      // Color: bright ember at spawn → green base → dim over life.
      const t = partAge / PARTICLE_LIFE_S;
      // Ember intensity peaks early (first 25% of life) for a "flash"
      // effect, then settles into the body color, then fades.
      const ember = Math.max(0, 1 - t * 4);            // 1 → 0 over 0..0.25
      const fade = Math.max(0, 1 - t);                 // 1 → 0 over full life
      // Source body color for this particle (stored in origins-paired
      // colors at start — but we overwrote colors with 0 to hide
      // pre-activation. Reconstruct from gradient using the local Y.)
      const ly = oy;
      const wave = Math.sin(ly * GRADIENT_BAND_FREQ) * 0.5 + 0.5;
      const baseR = GRADIENT_DARK.r * (1 - wave) + GRADIENT_LIGHT.r * wave;
      const baseG = GRADIENT_DARK.g * (1 - wave) + GRADIENT_LIGHT.g * wave;
      const baseB = GRADIENT_DARK.b * (1 - wave) + GRADIENT_LIGHT.b * wave;
      // Ember tint: warm yellow-white at peak, blending out into base color.
      const r = (baseR + ember * (1.0 - baseR)) * fade;
      const g = (baseG + ember * (0.85 - baseG)) * fade;
      const b = (baseB + ember * (0.55 - baseB)) * fade;
      pd.colors[i * 3 + 0] = Math.max(0, r);
      pd.colors[i * 3 + 1] = Math.max(0, g);
      pd.colors[i * 3 + 2] = Math.max(0, b);
    }
    pd.geom.attributes.position.needsUpdate = true;
    pd.geom.attributes.color.needsUpdate = true;

    // Done condition: wave finished AND no particles still alive.
    if (waveT >= 1 && aliveCount === 0 && !disintegrateDone) {
      disintegrateDone = true;
      // Hide the points object (final cleanup happens in dispose).
      pd.points.visible = false;
      // Fire callback once.
      const cb = disintegrateOnDone;
      disintegrateOnDone = null;
      if (cb) cb();
    }
  }

  function update(ctx: MascotContext): void {
    // Disintegrate branch: once triggered, the wander/breath/tilt freeze
    // and the dissolve wave + particles take over.
    if (disintegrating) {
      updateDisintegrate(ctx);
      bodyTimeUniform.value = ctx.t;
      return;
    }

    // Materialize branch: reverse-disintegrate at first show. Particles
    // converge to vertex targets while cutoff sweeps up (mode 1).
    if (materializing) {
      updateMaterialize(ctx);
      bodyTimeUniform.value = ctx.t;
      if (mixer.value) mixer.value.update(ctx.dt);
      return;
    }

    if (firstSeenT < 0 && group.visible) firstSeenT = ctx.t;
    const since = firstSeenT >= 0 ? ctx.t - firstSeenT : 0;

    // Pre-materialize delay: keep him scaled to 0 (invisible) while the
    // stars settle in. After ENTRY_DELAY, kick off the materialize and
    // return; next frame the materialize branch above takes over.
    if (!materializeDone) {
      if (since < ENTRY_DELAY) {
        group.scale.setScalar(0);
        return;
      }
      startMaterialize();
      return;
    }

    // Steady state: wander (position) + breath (scale) + look-at
    // (rotation). Time origin is materializeEndT so wx/wy both start
    // at sin(0)=0 — no snap from the (0,0,0) end-of-materialize
    // position into the wander cycle.
    const wt = ctx.t - materializeEndT;
    const wx = Math.sin(wt * WANDER_X_FREQ) * WANDER_X_AMP;
    const wy = Math.sin(wt * WANDER_Y_FREQ) * WANDER_Y_AMP;
    group.position.set(wx, wy, 0);

    const breath = 1 + Math.sin(wt * BREATH_FREQ) * BREATH_AMP;
    group.scale.setScalar(TURTLE_SCALE * breath);

    // Focus-point look-at: the head tracks a slowly-drifting point
    // near the camera origin. As the turtle wanders, the head
    // counter-rotates so it stays approximately aimed at the user.
    // Small-angle approximation: tilt = (focus - position) * gain.
    // Signs FLIPPED from the legacy `wx * TILT_PER_UNIT` mapping —
    // the prior code tilted INTO the wander (swing); this tilts
    // AGAINST the wander (lock-on).
    const focusX = Math.sin(wt * FOCUS_X_FREQ) * FOCUS_X_AMP;
    const focusY = Math.cos(wt * FOCUS_Y_FREQ + 1.5) * FOCUS_Y_AMP;
    tiltGroup.rotation.x = (focusY - wy) * FOCUS_TILT_GAIN;
    tiltGroup.rotation.z = (focusX - wx) * FOCUS_TILT_GAIN;

    bodyTimeUniform.value = ctx.t;
    if (mixer.value) mixer.value.update(ctx.dt);
  }

  function dispose(): void {
    if (mixer.value) mixer.value.stopAllAction();
    for (const d of disposables) {
      try { d.dispose(); } catch { /* swallow */ }
    }
    disposables.length = 0;
    if (particleData) {
      particleData.geom.dispose();
      particleData.mat.dispose();
      if (particleData.points.parent) particleData.points.parent.remove(particleData.points);
      particleData = null;
    }
    window.removeEventListener('keydown', onKey);
    unsubDebug();
    clearDebug('turtle.rotX');
    clearDebug('turtle.rotY');
    clearDebug('turtle.rotZ');
    if (group.parent) group.parent.remove(group);
  }

  function reset(): void {
    // Restore from disintegration: clear particles, reset dissolve, replay materialize.
    if (particleData) {
      if (particleData.points.parent) particleData.points.parent.remove(particleData.points);
      particleData.geom.dispose();
      particleData.mat.dispose();
      particleData = null;
    }
    disintegrating = false;
    disintegrateStartT = -1;
    disintegrateDone = false;
    disintegrateOnDone = null;
    materializing = false;
    materializeStartT = -1;
    materializeDone = false;
    materializeEndT = -1;
    // Start invisible (materialize mode); next show triggers the
    // toe-to-head reveal.
    dissolveModeUniform.value = 1.0;
    dissolveUniform.value = -1e9;
    group.scale.setScalar(0);
    group.position.set(0, 0, 0);
    tiltGroup.rotation.x = 0;
    tiltGroup.rotation.z = 0;
    firstSeenT = -1;
    if (mixerAction) {
      try { mixerAction.reset().play(); } catch { /* mixer already stopped */ }
    }
  }

  return { group, update, dispose, ready, disintegrate: startDisintegrate, reset };
}

function formatRot(r: number): string {
  const deg = (r * 180) / Math.PI;
  return `${r.toFixed(3)} (${deg.toFixed(1)}°)`;
}

// (easeOutBack removed — was used by the legacy hyperspace warp-in;
//  the new materialize uses cubic ease-in-out inline.)
