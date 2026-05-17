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
const VIOLET = 0x7c3aed;                // Clat's brand violet
const ANIMATION_TIME_SCALE = 0.01;      // 100× slower than native ("floating")

export function createTurtleMascot(): Mascot {
  const group = new THREE.Group();
  group.visible = false;

  // The turtle needs lighting — MeshStandardMaterial renders black
  // without it. Add lights as children of the group so they follow it
  // through the rig's scale transforms and don't affect anything else
  // in the scene (everything else here uses MeshBasicMaterial).
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(0.6, 1.2, 1.4);
  group.add(keyLight);
  const ambient = new THREE.AmbientLight(0xc8b3ff, 0.55);
  group.add(ambient);

  let mixer: THREE.AnimationMixer | null = null;
  const disposables: Array<{ dispose: () => void }> = [];

  const ready = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      ASSET_URL,
      (gltf) => {
        const root = gltf.scene;

        // Normalize: center on origin + scale longest axis to 1. The
        // rig applies anchor.width on top, so the mascot reads at a
        // predictable on-screen size regardless of source-model units.
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.sub(center);
        root.scale.setScalar(1 / maxDim);

        // Flat violet — drop the photorealistic body texture entirely.
        // One material for every mesh keeps the silhouette uniform.
        const violet = new THREE.MeshStandardMaterial({
          color: VIOLET,
          roughness: 0.55,
          metalness: 0.0,
        });
        disposables.push(violet);
        root.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            const orig = m.material as THREE.Material | THREE.Material[];
            if (Array.isArray(orig)) orig.forEach((mat) => mat.dispose?.());
            else orig?.dispose?.();
            m.material = violet;
            m.castShadow = false;
            m.receiveShadow = false;
            if (m.geometry) disposables.push(m.geometry);
          }
        });

        // Default orientation tweak — natural-pose turtle faces along
        // its local axis; yaw 90° so the camera reads its profile.
        root.rotation.set(0, Math.PI * 0.5, 0);

        group.add(root);

        // Wire up Swim Cycle at the slow timeScale.
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
