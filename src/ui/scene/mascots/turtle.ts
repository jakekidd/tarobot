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
        // rig applies anchor.width on top. CRITICAL: three.js composes
        // localMatrix as T * R * S (translate FIRST, then scale). If
        // we set `position = -center` (in source units) and `scale = 1/86`,
        // the translate isn't scaled down with the geometry — the
        // turtle ends up at world (1, 1.5, 19.5)·scale, which puts it
        // BEHIND the camera (at z=100) when the rig scales up.
        // Divide the offset by maxDim so it scales correctly:
        //   final geometry pos = root.position + scale * geometry_vert
        // For geometry_vert = center, we want final = 0:
        //   root.position = -scale * center = -center / maxDim
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
        console.info(
          '[turtleMascot] root bbox:', JSON.stringify(box.min), 'to', JSON.stringify(box.max),
          '· size:', JSON.stringify(size),
          '· scaled to 1/maxDim =', (1 / maxDim).toFixed(4),
          '· root.position =', root.position.toArray().map((v) => v.toFixed(4)),
        );

        // DEBUG: MeshBasicMaterial cyan — unlit, definitely renders
        // regardless of normals, lights, or skinning shader paths.
        const violet = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        disposables.push(violet);
        // DEBUG: for each SkinnedMesh, also add a SIBLING regular Mesh
        // with the same geometry at the same parent. If the sibling
        // renders but the original SkinnedMesh doesn't, the issue is
        // skinning-pipeline (skeleton, bind matrices, shader). If
        // neither renders, it's something else (camera / material /
        // depth). Sibling positioned at same world location.
        let meshCount = 0;
        let skinnedCount = 0;
        const skinnedMeshes: THREE.SkinnedMesh[] = [];
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
            m.frustumCulled = false;
            const sm = m as unknown as THREE.SkinnedMesh;
            const isSkinned = (sm as THREE.SkinnedMesh).isSkinnedMesh === true;
            if (isSkinned) {
              skinnedCount += 1;
              skinnedMeshes.push(sm);
            }
            const wpos = new THREE.Vector3();
            m.getWorldPosition(wpos);
            const meshBox = new THREE.Box3().setFromObject(m);
            console.info(
              '[turtleMascot] mesh', meshCount,
              '· name:', m.name,
              '· isSkinned:', isSkinned,
              '· verts:', m.geometry.attributes.position?.count ?? '?',
              '· worldPos:', [wpos.x, wpos.y, wpos.z].map((v) => v.toFixed(2)),
              '· bbox:', JSON.stringify({ min: meshBox.min.toArray(), max: meshBox.max.toArray() }),
            );
            if (m.geometry) disposables.push(m.geometry);
          }
        });
        // DEBUG: for each SkinnedMesh, drop a plain Mesh control at the
        // SkinnedMesh's parent with the SAME geometry. Different bright
        // color (orange) so we can tell them apart. Same world transform.
        const controlMat = new THREE.MeshBasicMaterial({ color: 0xff9900 });
        disposables.push(controlMat);
        for (const sm of skinnedMeshes) {
          const ctrl = new THREE.Mesh(sm.geometry, controlMat);
          ctrl.frustumCulled = false;
          ctrl.renderOrder = 1000;
          // Place at the same parent so transforms match exactly.
          if (sm.parent) sm.parent.add(ctrl);
        }
        console.info(
          '[turtleMascot] meshes:', meshCount,
          '· skinned:', skinnedCount,
          '· added', skinnedMeshes.length, 'orange sibling control meshes',
        );

        // Tilt 90° on X so the turtle faces the camera.
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
