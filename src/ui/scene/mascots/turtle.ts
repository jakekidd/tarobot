// Turtle mascot — loggerhead sea turtle in his native skin, with the
// eyes recoloured to a warm-white glow that pops against the dark scene.
// Plays "Swim Cycle" at 0.2× (calm paddle, not racing) and drifts on a
// soft Lissajous wander while BANKING into the drift so the back tilts
// up as he climbs and tilts left/right with horizontal motion.
//
// Implements the Mascot interface in ./types.ts so the scene can swap
// it with any other mascot (Clat, future-mascots) without changes
// elsewhere.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Mascot, MascotContext } from './types';

const ASSET_URL = '/mascots/turtle/scene.gltf';
const EYE_COLOR = 0xfff7e0;            // warm white — pops inside the silhouette
const EYE_MESH_NAME = 'Object_38';     // the smaller skinned mesh in the gltf
const ANIMATION_TIME_SCALE = 0.2;      // 5× slower than native — calm paddle
const TURTLE_SCALE = 2.0;              // 2× larger than the anchor footprint

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

export function createTurtleMascot(): Mascot {
  const group = new THREE.Group();
  group.visible = false;

  // Tilt container — sits between `group` (which holds the wander
  // translation) and `root` (which holds the face-camera baseline).
  // Tilting this container applies the bank in world-aligned axes,
  // which composes cleanly with the head-toward-camera Y rotation
  // baked into root.
  const tiltGroup = new THREE.Group();
  group.add(tiltGroup);

  // Eye glow — applied in place of the gltf's eye material so the turtle
  // has visible eyes even when the body uses the original PBR skin.
  const eyeMat = new THREE.MeshBasicMaterial({ color: EYE_COLOR });

  let mixer: THREE.AnimationMixer | null = null;
  const disposables: Array<{ dispose: () => void }> = [eyeMat];

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

        // Keep the gltf's native materials on the body; only replace the
        // eyes with the warm-white glow. Body materials still get tracked
        // for disposal so cleanup is leak-free.
        root.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (!m.isMesh) return;
          if (m.name === EYE_MESH_NAME) {
            const orig = m.material as THREE.Material | THREE.Material[];
            if (Array.isArray(orig)) orig.forEach((mat) => mat.dispose?.());
            else orig?.dispose?.();
            m.material = eyeMat;
          } else if (m.material) {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) disposables.push(mat);
          }
          m.castShadow = false;
          m.receiveShadow = false;
          // SkinnedMesh frustum culling uses the rest-pose bbox, which
          // doesn't match the animated pose. Disable to prevent flicker.
          m.frustumCulled = false;
          if (m.geometry) disposables.push(m.geometry);
        });

        // Face the camera. gltf native orientation has head at -Z (swim
        // direction), shell at +Y. Camera looks down -Z, so PI on Y
        // flips the head to +Z (toward camera) with the shell still up.
        root.rotation.set(0, Math.PI, 0);
        tiltGroup.add(root);

        // 2× the anchor footprint.
        group.scale.setScalar(TURTLE_SCALE);

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
    // Lissajous drift on x/y; z held flat (orthographic camera, no use).
    const wx = Math.sin(ctx.t * WANDER_X_FREQ) * WANDER_X_AMP;
    const wy = Math.cos(ctx.t * WANDER_Y_FREQ) * WANDER_Y_AMP;
    group.position.set(wx, wy, 0);

    // Bank into the offset. Negative signs chosen so that when the
    // turtle is above center, the back tilts away from camera (back-up
    // pose); when he's to the right, his right side lifts.
    tiltGroup.rotation.x = -wy * TILT_PER_UNIT;
    tiltGroup.rotation.z = -wx * TILT_PER_UNIT;

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
