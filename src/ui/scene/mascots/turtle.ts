// Turtle mascot — loggerhead sea turtle, violet shell + warm-white eyes,
// slowly-played "Swim Cycle" animation (flippers paddle, head bobs),
// drifting on a soft Lissajous wander while staying face-on to the camera.
// Stripped textures; total asset weight ~860 KB.
//
// Implements the Mascot interface in ./types.ts so the scene can swap
// it with any other mascot (Clat, future-mascots) without changes
// elsewhere.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Mascot, MascotContext } from './types';

const ASSET_URL = '/mascots/turtle/scene.gltf';
const VIOLET = 0x7c3aed;       // Clat's brand violet — shell + body + flippers
const EYE_COLOR = 0xfff7e0;    // warm white — pops inside the silhouette
const EYE_MESH_NAME = 'Object_38';
const ANIMATION_TIME_SCALE = 0.1;   // 10× slower than native swim — drifting paddle

// Wander shape — Lissajous-ish drift in positionGroup-local units.
// At rig scale ~100 px/unit, these become ±12px / ±8px on screen.
const WANDER_X_AMP = 0.12;
const WANDER_Y_AMP = 0.08;
const WANDER_X_FREQ = 0.31;    // rad/sec — slow
const WANDER_Y_FREQ = 0.23;

export function createTurtleMascot(): Mascot {
  const group = new THREE.Group();
  group.visible = false;

  // Unlit materials — the rest of the scene uses MeshBasicMaterial and has
  // no lights, so a PBR material renders black. Flat colors read as crisp
  // silhouettes against the void and match the CRT aesthetic.
  const bodyMat = new THREE.MeshBasicMaterial({ color: VIOLET });
  const eyeMat = new THREE.MeshBasicMaterial({ color: EYE_COLOR });

  let mixer: THREE.AnimationMixer | null = null;
  const disposables: Array<{ dispose: () => void }> = [bodyMat, eyeMat];

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

        root.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            const orig = m.material as THREE.Material | THREE.Material[];
            if (Array.isArray(orig)) orig.forEach((mat) => mat.dispose?.());
            else orig?.dispose?.();
            m.material = m.name === EYE_MESH_NAME ? eyeMat : bodyMat;
            m.castShadow = false;
            m.receiveShadow = false;
            // SkinnedMesh frustum culling uses the rest-pose bbox, which
            // doesn't match the animated pose. Disable to prevent flicker.
            m.frustumCulled = false;
            if (m.geometry) disposables.push(m.geometry);
          }
        });

        // Face the camera. gltf native orientation has head at -Z (swim
        // direction), shell at +Y. Camera looks down -Z, so without
        // rotation we'd see the back of the head. PI on Y flips the
        // turtle so the head points +Z (toward camera) with the shell
        // still up — portrait view.
        root.rotation.set(0, Math.PI, 0);
        group.add(root);

        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(root);
          const clip = gltf.animations[0];
          if (clip) {
            mixer.clipAction(clip).play();
            mixer.timeScale = ANIMATION_TIME_SCALE;
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
    // Lissajous drift — two incommensurate frequencies so the path
    // never closes. Rotation untouched, so the turtle keeps facing
    // the camera as he wanders.
    group.position.set(
      Math.sin(ctx.t * WANDER_X_FREQ) * WANDER_X_AMP,
      Math.cos(ctx.t * WANDER_Y_FREQ) * WANDER_Y_AMP,
      0,
    );
    if (mixer) mixer.update(ctx.dt);
  }

  function dispose(): void {
    if (mixer) mixer.stopAllAction();
    for (const d of disposables) {
      try { d.dispose(); } catch { /* swallow */ }
    }
    disposables.length = 0;
    if (group.parent) group.parent.remove(group);
  }

  return { group, update, dispose, ready };
}
