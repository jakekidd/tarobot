// The menu's three.js backdrop — the rainbow starfield and the turtle,
// back from the dead: swimming slow lissajous laps through the void,
// no speech, no text box. A lean revival of the old mascot (the full
// rig with dissolve particles and the debug bus stays in git history);
// same gltf, same green flowing gradient, same 5×-slowed paddle.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStarField, type StarField } from './booth/starfield';

const TURTLE_URL = '/mascots/turtle/scene.gltf';
const TURTLE_EYE_MESH = 'Object_38';
const ANIMATION_TIME_SCALE = 0.2;
const TURTLE_SCALE = 1.7;

export class MenuScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private stars: StarField;
  private turtle: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private bodyTime = { value: 0 };
  private disposables: Array<{ dispose(): void }> = [];
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private dead = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    this.scene.background = new THREE.Color('#05030c');
    this.stars = createStarField(this.renderer.getPixelRatio(), 1600);
    this.scene.add(this.stars.points);
    this.loadTurtle();
    this.resize();
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    this.loop(this.last);
  }

  private loadTurtle(): void {
    // the flowing green gradient from the original mascot, compacted:
    // bands of moss lerped by local Y + time, facet shading via
    // screen-space derivatives. MeshBasicMaterial so no lights needed;
    // three wires the skinning chunks in for the skinned meshes.
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bodyTime = this.bodyTime;
    bodyMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = bodyTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nvarying vec3 vLocalPos;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float wave = sin(vLocalPos.y * 4.0 + uTime * 0.375) * 0.5 + 0.5;
           vec3 deep = vec3(0.016, 0.118, 0.055);
           vec3 dark = vec3(0.039, 0.220, 0.094);
           vec3 lite = vec3(0.227, 0.604, 0.290);
           vec3 base = wave < 0.5 ? mix(deep, dark, wave * 2.0) : mix(dark, lite, (wave - 0.5) * 2.0);
           vec3 fn = normalize(cross(dFdx(vLocalPos), dFdy(vLocalPos)));
           base *= 1.0 - 0.22 * (0.5 - clamp(fn.y * 0.5 + 0.5, 0.0, 1.0));
           diffuseColor.rgb = base;`,
        );
    };
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff7e0 });
    this.disposables.push(bodyMat, eyeMat);

    new GLTFLoader().load(
      TURTLE_URL,
      (gltf) => {
        if (this.dead) return;
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.set(-center.x / maxDim, -center.y / maxDim, -center.z / maxDim);
        root.scale.setScalar(1 / maxDim);
        root.rotation.set(0, Math.PI, 0);
        root.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (!m.isMesh) return;
          const orig = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(orig)) orig.forEach((mat) => mat.dispose?.());
          else orig?.dispose?.();
          m.material = m.name === TURTLE_EYE_MESH ? eyeMat : bodyMat;
          m.frustumCulled = false;
          if (m.geometry) this.disposables.push(m.geometry);
        });
        const group = new THREE.Group();
        group.add(root);
        group.scale.setScalar(TURTLE_SCALE);
        this.turtle = group;
        this.scene.add(group);
        if (gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(root);
          this.mixer.clipAction(gltf.animations[0]).play();
          this.mixer.timeScale = ANIMATION_TIME_SCALE;
        }
      },
      undefined,
      () => {
        /* stars-only backdrop is a fine menu */
      },
    );
  }

  private resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = (t: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const time = t / 1000;

    this.stars.update(time);
    this.bodyTime.value = time;
    if (this.mixer) this.mixer.update(dt);
    if (this.turtle) {
      // two incommensurate frequencies so the lap never closes; a slow
      // breath scale sells depth; bank into the drift
      this.turtle.position.set(
        Math.sin(time * 0.25) * 1.7,
        Math.sin(time * 0.185) * 0.85,
        -1.6 + Math.sin(time * 0.11) * 0.9,
      );
      this.turtle.rotation.z = -Math.cos(time * 0.25) * 0.18;
      this.turtle.rotation.x = Math.cos(time * 0.185) * 0.12;
      this.turtle.scale.setScalar(TURTLE_SCALE * (1 + 0.06 * Math.sin(time * 0.19)));
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.stars.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
