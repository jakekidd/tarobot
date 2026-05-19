// Turtle mascot — loggerhead sea turtle in his native skin, with the
// eyes recoloured to a warm-white glow that pops against the dark scene.
// Plays "Swim Cycle" at 0.2× (calm paddle, not racing) and drifts on a
// soft Lissajous wander while BANKING into the drift so the back tilts
// up as he climbs and tilts left/right with horizontal motion.
//
// Debug rotation control: when the DEBUG chip is on, arrow keys spin the
// turtle live, current rotation prints in the debug overlay. Find the
// orientation you want, copy the values, and bake them into BASE_ROTATION
// below.
//
// Implements the Mascot interface in ./types.ts so the scene can swap
// it with any other mascot (Clat, future-mascots) without changes
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

// Animated green gradient — flows over the skin in model space, so it
// stays glued to the body as the bones animate (rather than slipping
// as he wanders through world space). Two greens lerped by a sine of
// position.y + uTime; speed and band density tunable here.
const GRADIENT_DARK = new THREE.Color(0x0a3818);   // deep moss
const GRADIENT_LIGHT = new THREE.Color(0x3a9a4a);  // medium green — peak no longer triggers bloom blowout
const GRADIENT_BAND_FREQ = 4.0;     // bands per unit of local Y — higher = tighter stripes
const GRADIENT_SPEED = 0.375;       // rad/sec — slow flow (¼ of the original 1.5)
// Push back in local Z. With group.scale=2 and the rig's ~100 px/unit
// scale on top, Z_OFFSET=-1.0 puts him ~200 world units behind the
// rig anchor — well clear of the camera's near plane (at z=99.9) even
// when bank-tilt swings part of the model forward.
const Z_OFFSET = -1.0;

// ↓↓↓ BAKED ORIENTATION — edit this after dialing in via debug arrows. ↓↓↓
// Order: (x, y, z) in radians.
const BASE_ROTATION = new THREE.Euler(0, Math.PI, 0);
// ↑↑↑

// Wander shape — two incommensurate frequencies so the path never closes.
// Amplitudes in positionGroup-local units (rig is ~100 px/unit), so
// ±30px / ±20px of drift on screen at rest scale.
const WANDER_X_AMP = 0.30;
const WANDER_Y_AMP = 0.20;
const WANDER_X_FREQ = 0.50;   // rad/sec
const WANDER_Y_FREQ = 0.37;

// Bank-tilt: radians of tilt per unit of wander offset. With max wander
// of 0.30, that's ~17° tilt at the extreme — readable but not goofy.
const TILT_PER_UNIT = 1.0;

// Debug rotation: arrow-key increment (radians). ~5.7° per press.
const DEBUG_ROT_STEP = 0.1;

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

  // Eye glow — applied in place of the gltf's eye material so the turtle
  // has visible eyes even when the body uses the original PBR skin.
  // depthTest=false so the eyes draw THROUGH the head silhouette — the
  // eye mesh sits inside the eye sockets and would otherwise be occluded.
  const eyeMat = new THREE.MeshBasicMaterial({
    color: EYE_COLOR,
    depthTest: false,
  });

  // Body skin — MeshBasicMaterial patched via onBeforeCompile so we get
  // built-in skinning vertex chunks for free, then override the
  // fragment color with an animated gradient driven by a shared uTime
  // uniform. CPU cost per frame = one uniform write; GPU cost is a
  // single sin + mix per fragment.
  const bodyTimeUniform = { value: 0 };
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  bodyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = bodyTimeUniform;
    shader.uniforms.uGradDark = { value: GRADIENT_DARK };
    shader.uniforms.uGradLight = { value: GRADIENT_LIGHT };
    shader.uniforms.uBandFreq = { value: GRADIENT_BAND_FREQ };
    shader.uniforms.uSpeed = { value: GRADIENT_SPEED };
    // Pass the rest-pose local position to the fragment so the gradient
    // is painted onto the skin and follows the bone animation rather
    // than slipping as the model translates.
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
         uniform vec3 uGradDark;
         uniform vec3 uGradLight;
         uniform float uBandFreq;
         uniform float uSpeed;
         varying vec3 vLocalPos;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float wave = sin(vLocalPos.y * uBandFreq + uTime * uSpeed) * 0.5 + 0.5;
         diffuseColor.rgb = mix(uGradDark, uGradLight, wave);`,
      );
  };
  // Live rotation — starts at BASE_ROTATION, mutated by debug arrow keys.
  // root.rotation is kept in sync so what you see is what gets reported.
  const liveRotation = BASE_ROTATION.clone();
  let rootRef: THREE.Object3D | null = null;
  let debugVisible = false;

  const mixer: { value: THREE.AnimationMixer | null } = { value: null };
  const disposables: Array<{ dispose: () => void }> = [eyeMat, bodyMat];

  function publishRotation(): void {
    publishDebug('turtle.rotX', formatRot(liveRotation.x));
    publishDebug('turtle.rotY', formatRot(liveRotation.y));
    publishDebug('turtle.rotZ', formatRot(liveRotation.z));
  }

  function onKey(e: KeyboardEvent): void {
    if (!debugVisible) return;
    // Don't hijack arrows while the user is typing in an input/textarea.
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
            m.renderOrder = 10; // draw after the body so depthTest=false reads cleanly
          } else {
            m.material = bodyMat;
          }
          m.castShadow = false;
          m.receiveShadow = false;
          // SkinnedMesh frustum culling uses the rest-pose bbox, which
          // doesn't match the animated pose. Disable to prevent flicker.
          m.frustumCulled = false;
          if (m.geometry) disposables.push(m.geometry);
        });

        // Apply the live rotation (default = BASE_ROTATION, can be
        // mutated by debug arrow keys).
        root.rotation.copy(liveRotation);
        tiltGroup.add(root);
        rootRef = root;
        if (debugVisible) publishRotation();

        // 2× the anchor footprint.
        group.scale.setScalar(TURTLE_SCALE);

        if (gltf.animations.length > 0) {
          mixer.value = new THREE.AnimationMixer(root);
          const clip = gltf.animations[0];
          if (clip) {
            mixer.value.clipAction(clip).play();
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

  function update(ctx: MascotContext): void {
    // Lissajous drift on x/y; z held flat (orthographic camera, no use).
    const wx = Math.sin(ctx.t * WANDER_X_FREQ) * WANDER_X_AMP;
    const wy = Math.cos(ctx.t * WANDER_Y_FREQ) * WANDER_Y_AMP;
    group.position.set(wx, wy, 0);

    // Bank into the offset. With the turtle's head at +Z and right side
    // at +X, positive X rotation dips the head down (back rises up) and
    // positive Z rotation lifts the right side. So tilt magnitude tracks
    // drift direction directly.
    tiltGroup.rotation.x = wy * TILT_PER_UNIT;
    tiltGroup.rotation.z = wx * TILT_PER_UNIT;

    // Drive the moving-gradient shader.
    bodyTimeUniform.value = ctx.t;

    if (mixer.value) mixer.value.update(ctx.dt);
  }

  function dispose(): void {
    if (mixer.value) mixer.value.stopAllAction();
    for (const d of disposables) {
      try { d.dispose(); } catch { /* swallow */ }
    }
    disposables.length = 0;
    window.removeEventListener('keydown', onKey);
    unsubDebug();
    clearDebug('turtle.rotX');
    clearDebug('turtle.rotY');
    clearDebug('turtle.rotZ');
    if (group.parent) group.parent.remove(group);
  }

  return { group, update, dispose, ready };
}

function formatRot(r: number): string {
  const deg = (r * 180) / Math.PI;
  return `${r.toFixed(3)} (${deg.toFixed(1)}°)`;
}
