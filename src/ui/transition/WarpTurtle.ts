// Minimal turtle loader for the warp demo. Loads /mascots/turtle/scene.gltf,
// normalises size, applies the same green-gradient body shader + warm-
// white eye material as the main mascot — but skips wander/breath/tilt/
// warp-in entrance so the demo's phase machine has full authority over
// scale/position/rotation.
//
// Returns a group you parent into your scene, an `update(dt)` to drive
// the swim-cycle animation, a `dispose` to release GPU resources, and a
// `ready` promise that resolves once the gltf has loaded.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_URL = '/mascots/turtle/scene.gltf';
const EYE_MESH_NAME = 'Object_38';
const ANIMATION_TIME_SCALE = 0.2;

// Default size after normalisation = 1 world unit. Caller scales the
// parent group up to taste.
const NATIVE_SIZE = 1;

// Same brand-violet face-camera rotation as the main mascot.
const BASE_ROTATION = new THREE.Euler(0, Math.PI, 0);

// Green-gradient shader knobs (matches main mascot for visual continuity).
const GRADIENT_DARK = new THREE.Color(0x0a3818);
const GRADIENT_LIGHT = new THREE.Color(0x3a9a4a);
const GRADIENT_BAND_FREQ = 4.0;
const GRADIENT_SPEED = 0.375;

const EYE_COLOR = 0xfff7e0;

export type WarpTurtle = {
  group: THREE.Group;
  update: (dt: number, t: number) => void;
  /** Set the swim-cycle mixer timeScale. Couple to spring velocity so
   *  the paddle visibly speeds up during perch transitions. */
  setAnimationSpeed: (scale: number) => void;
  dispose: () => void;
  ready: Promise<void>;
};

export function createWarpTurtle(): WarpTurtle {
  const group = new THREE.Group();

  const eyeMat = new THREE.MeshBasicMaterial({
    color: EYE_COLOR,
    depthTest: false,
  });

  // Animated gradient body material (same hook the main mascot uses).
  const bodyTimeUniform = { value: 0 };
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  bodyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = bodyTimeUniform;
    shader.uniforms.uGradDark = { value: GRADIENT_DARK };
    shader.uniforms.uGradLight = { value: GRADIENT_LIGHT };
    shader.uniforms.uBandFreq = { value: GRADIENT_BAND_FREQ };
    shader.uniforms.uSpeed = { value: GRADIENT_SPEED };
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

  const disposables: Array<{ dispose: () => void }> = [eyeMat, bodyMat];
  let mixer: THREE.AnimationMixer | null = null;

  const ready = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      ASSET_URL,
      (gltf) => {
        const root = gltf.scene;

        // Normalise: bbox center → origin, longest axis → NATIVE_SIZE.
        // Pre-divide the translation by maxDim so T composes correctly
        // through S (three.js applies T then R then S).
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const center = new THREE.Vector3(); box.getCenter(center);
        const k = NATIVE_SIZE / maxDim;
        root.position.set(-center.x * k, -center.y * k, -center.z * k);
        root.scale.setScalar(k);

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

        root.rotation.copy(BASE_ROTATION);
        group.add(root);

        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(root);
          const clip = gltf.animations[0];
          if (clip) {
            mixer.clipAction(clip).play();
            mixer.timeScale = ANIMATION_TIME_SCALE;
          }
        }

        resolve();
      },
      undefined,
      (err) => {
        console.warn('[WarpTurtle] load failed:', err);
        reject(err);
      },
    );
  });

  function update(dt: number, t: number): void {
    bodyTimeUniform.value = t;
    if (mixer) mixer.update(dt);
  }

  function setAnimationSpeed(scale: number): void {
    if (mixer) mixer.timeScale = scale;
  }

  function dispose(): void {
    if (mixer) mixer.stopAllAction();
    for (const d of disposables) { try { d.dispose(); } catch { /* swallow */ } }
    disposables.length = 0;
    if (group.parent) group.parent.remove(group);
  }

  return { group, update, setAnimationSpeed, dispose, ready };
}
