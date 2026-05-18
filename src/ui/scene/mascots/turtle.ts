// Turtle mascot — loggerhead sea turtle with the "Swim Cycle" animation
// played at 0.01× (floating, not swimming). Stripped textures; flat
// violet material matching Clat's brand color. Mobile-friendly: total
// asset weight ~860 KB.
//
// Implements the Mascot interface in ./types.ts so the scene can swap
// it with any other mascot (Clat, future-mascots) without changes
// elsewhere.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Mascot, MascotContext } from './types';

const ASSET_URL = '/mascots/turtle/scene.gltf';
const VIOLET = 0x7c3aed;
const ANIMATION_TIME_SCALE = 0.01; // 100× slower than native ("floating")

export function createTurtleMascot(): Mascot {
  const group = new THREE.Group();
  group.visible = false;

  // Unlit material — the rest of the scene uses MeshBasicMaterial and has
  // no lights, so a PBR material renders black. Flat violet reads as a
  // clear silhouette against the void and matches the CRT aesthetic.
  const material = new THREE.MeshBasicMaterial({ color: VIOLET });

  let mixer: THREE.AnimationMixer | null = null;
  const disposables: Array<{ dispose: () => void }> = [material];

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
        // the model translated by ~20 units (which puts it behind the
        // camera once the rig ramps to its steady-state scale).
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
            m.material = material;
            m.castShadow = false;
            m.receiveShadow = false;
            // SkinnedMesh frustum culling uses the rest-pose bbox, which
            // doesn't match the animated pose. Disable to prevent flicker.
            m.frustumCulled = false;
            if (m.geometry) disposables.push(m.geometry);
          }
        });

        // Face the camera (gltf model is oriented with -z forward; rotate
        // 90° on X to bring the back of the shell toward the camera).
        root.rotation.set(Math.PI * 0.5, 0, 0);
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
    // Turtle ignores mouse + dizzy for now — it just floats. Future
    // versions could pulse on dizzy or react to cursor proximity.
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
