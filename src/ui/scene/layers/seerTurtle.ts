// Seer turtle — loggerhead sea turtle skeleton mesh with the "Swim Cycle"
// animation played at 0.01× speed so it reads as floating, not swimming.
//
// Asset: /public/seer/scene.gltf (+ scene.bin). Textures stripped — we
// shade everything in flat violet to match Clat's color and keep mobile
// bandwidth tiny. Total asset weight ~860 KB.
//
// API: createSeerTurtle(loadingManager?) → { group, update(dt), dispose() }
// The caller parents `group` into whatever scene/position rig it wants
// and ticks `update(dt)` from its render loop.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_URL = '/seer/scene.gltf';
const VIOLET = 0x7c3aed;                // Clat's brand violet
const ANIMATION_TIME_SCALE = 0.01;      // 100× slower than native ("floating")

export type SeerTurtle = {
  /** Root group. Parent this into whatever rig you want. Starts invisible
   *  and becomes visible once the asset has loaded. */
  group: THREE.Group;
  /** Tick from the render loop. */
  update: (dt: number) => void;
  /** Dispose geometries + materials. Removes group from any parent. */
  dispose: () => void;
  /** Resolved once the asset has loaded (or rejected if loading failed). */
  ready: Promise<void>;
};

export function createSeerTurtle(): SeerTurtle {
  const group = new THREE.Group();
  group.visible = false;

  let mixer: THREE.AnimationMixer | null = null;
  const disposables: Array<{ dispose: () => void }> = [];

  const ready = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      ASSET_URL,
      (gltf) => {
        const root = gltf.scene;

        // Compute the model's bounding box at native scale so we can
        // normalize it into a ~1-unit cube (the rig expects unit-sized
        // characters; anchor handles screen-space scaling).
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const norm = 1 / maxDim;

        // Center the model on origin, then scale to unit.
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.sub(center);
        root.scale.setScalar(norm);

        // Walk meshes — replace materials with flat violet. Keep
        // geometry untouched (the wireframe / surface is the point).
        const violetMat = new THREE.MeshStandardMaterial({
          color: VIOLET,
          roughness: 0.55,
          metalness: 0.0,
          // The original eyes mesh is a small set of separate verts —
          // a single uniform material across both reads as a single
          // "purple turtle" silhouette, no broken material seams.
        });
        disposables.push(violetMat);
        root.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            // Dispose the original material so we don't leak it.
            const orig = m.material as THREE.Material | THREE.Material[];
            if (Array.isArray(orig)) orig.forEach((mat) => mat.dispose?.());
            else orig?.dispose?.();
            m.material = violetMat;
            m.castShadow = false;
            m.receiveShadow = false;
            if (m.geometry) disposables.push(m.geometry);
          }
        });

        group.add(root);

        // Orientation: the loggerhead's natural orientation has the
        // turtle facing one direction. Without tweaking we tilt it so
        // the head reads up-and-toward-camera, more "floating mascot"
        // than "swimming creature."
        root.rotation.set(0, Math.PI * 0.5, 0); // 90° yaw — face camera

        // Wire the animation mixer — Swim Cycle is the only clip.
        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(root);
          const clip = gltf.animations[0];
          if (clip) {
            const action = mixer.clipAction(clip);
            action.play();
            mixer.timeScale = ANIMATION_TIME_SCALE;
          }
        }

        group.visible = true;
        resolve();
      },
      undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[seerTurtle] load failed:', err);
        reject(err);
      },
    );
  });

  function update(dt: number): void {
    if (mixer) mixer.update(dt);
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
