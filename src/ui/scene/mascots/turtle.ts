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
// const VIOLET = 0x7c3aed;             // Clat's brand violet (restore when debug box removed)
const ANIMATION_TIME_SCALE = 0.01;      // 100× slower than native ("floating")

export function createTurtleMascot(): Mascot {
  const group = new THREE.Group();
  group.visible = false;

  // Unlit material — the rest of the scene uses MeshBasicMaterial and has
  // no lights, so a PBR material was rendering black. Flat violet reads
  // as a clear silhouette against the dark void and matches the CRT
  // aesthetic. Mobile-cheap too (no lighting math per pixel).
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

        // DEBUG: MeshNormalMaterial colors by surface normal direction.
        // Renders without any lighting — if this doesn't show, the issue
        // is not lighting, it's visibility / scale / camera / culling.
        const violet = new THREE.MeshNormalMaterial();
        disposables.push(violet);
        let meshCount = 0;
        let skinnedCount = 0;
        root.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            meshCount += 1;
            const orig = m.material as THREE.Material | THREE.Material[];
            if (Array.isArray(orig)) orig.forEach((mat) => mat.dispose?.());
            else orig?.dispose?.();
            m.material = violet;
            m.castShadow = false;
            m.receiveShadow = false;
            // SkinnedMesh frustum culling uses the REST-POSE vertex bbox,
            // not the post-skinning world bounds. After our rotate/scale
            // the rest-pose bbox can fall outside the camera frustum even
            // though the rendered (skinned) verts are dead-center.
            // Disable culling for these specifically.
            const sm = m as unknown as THREE.SkinnedMesh;
            if ((sm as THREE.SkinnedMesh).isSkinnedMesh) {
              skinnedCount += 1;
              m.frustumCulled = false;
            }
            if (m.geometry) disposables.push(m.geometry);
          }
        });
        console.info(
          '[turtleMascot] meshes:', meshCount,
          '· skinned:', skinnedCount,
        );

        // Tilt 90° on X so the turtle faces the camera (otherwise the
        // model is in swim-pose — looking sideways relative to the ortho
        // camera's top-down view).
        root.rotation.set(Math.PI * 0.5, 0, 0);

        group.add(root);

        // DEBUG: explicit unit-cube wireframe in the group's local space.
        // depthTest=false so it draws over ANYTHING — particles, scene,
        // whatever. If this doesn't show, the group isn't being rendered
        // at all (visibility/anchor/camera issue, not z-order).
        const boxGeom = new THREE.BoxGeometry(1.05, 1.05, 1.05);
        const boxEdges = new THREE.EdgesGeometry(boxGeom);
        const boxMat = new THREE.LineBasicMaterial({
          color: 0xff0000,
          depthTest: false,
          depthWrite: false,
          transparent: true,
        });
        const debugBox = new THREE.LineSegments(boxEdges, boxMat);
        debugBox.renderOrder = 9999;
        group.add(debugBox);
        disposables.push(boxGeom, boxEdges, boxMat);

        // Inner debug crosshair — solid red sphere at the group origin.
        // Smaller than the box; helps confirm the group's actual center.
        const dotGeom = new THREE.SphereGeometry(0.08, 12, 8);
        const dotMat = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          depthTest: false,
        });
        const dot = new THREE.Mesh(dotGeom, dotMat);
        dot.renderOrder = 9999;
        group.add(dot);
        disposables.push(dotGeom, dotMat);

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
        console.info('[turtleMascot] loaded; bbox max-dim =', maxDim.toFixed(2));
        resolve();
      },
      undefined,
      (err) => {
        console.warn('[turtleMascot] load failed:', err);
        reject(err);
      },
    );
  });

  let lastReportedVisible: boolean | null = null;
  function update(ctx: MascotContext): void {
    // DEBUG: announce visibility transitions so we can confirm the
    // scene is actually trying to show the turtle.
    if (group.visible !== lastReportedVisible) {
      lastReportedVisible = group.visible;
      console.info(
        '[turtleMascot] visible →', group.visible,
        '· children:', group.children.length,
        '· world-scale:', group.parent?.scale.x.toFixed(2) ?? '?',
      );
    }
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
