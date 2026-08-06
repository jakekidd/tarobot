// The eye lab — every look in the leyebrary on one rig, live. Plain
// TS, no React: this page exists to stare at shaders, not to manage
// state. Click a look to morph, drag the sliders, chase the gaze with
// the pointer, reseed to grow a new flower.

import * as THREE from 'three';
import { EyeRig } from '../EyeRig';
import { LOOK_NAMES, type EyePairing, type LookName } from '../looks';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const foot = document.getElementById('foot') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#05030c');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
camera.position.set(0, 0, 2.1);

let seed = Math.floor(Math.random() * 0x7fffffff);
let pairing: EyePairing = 'match';
let look: LookName = 'mandala';
let grade = 0.75;
let lid = 0;
let rig: EyeRig;

function buildRig(): void {
  if (rig) {
    scene.remove(rig.group);
    rig.dispose();
  }
  rig = new EyeRig({ seed, pairing, eyeWidth: 0.62, separation: 0.78, grade });
  rig.setLook(look, 0);
  rig.setLid(lid);
  scene.add(rig.group);
  foot.textContent = `seed ${seed} · ${pairing} · ${look}`;
  (window as unknown as { rig: EyeRig }).rig = rig;
}

const gazeTarget = new THREE.Vector3(0, 0, 2.1);
window.addEventListener('pointermove', (ev) => {
  const nx = (ev.clientX / window.innerWidth) * 2 - 1;
  const ny = -(ev.clientY / window.innerHeight) * 2 + 1;
  gazeTarget.set(nx * 1.4, ny * 0.9, 1.4);
});

function button(label: string, onClick: (el: HTMLButtonElement) => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = label;
  el.addEventListener('click', () => onClick(el));
  hud.appendChild(el);
  return el;
}

const lookButtons = new Map<LookName, HTMLButtonElement>();
for (const name of LOOK_NAMES) {
  const el = button(name, () => {
    look = name;
    rig.setLook(name);
    lookButtons.forEach((b, n) => b.classList.toggle('active', n === name));
    foot.textContent = `seed ${seed} · ${pairing} · ${look}`;
  });
  lookButtons.set(name, el);
}
lookButtons.get(look)?.classList.add('active');

button('reseed', () => {
  seed = Math.floor(Math.random() * 0x7fffffff);
  buildRig();
});
button('pairing: match', (el) => {
  pairing = pairing === 'match' ? 'complement' : 'match';
  el.textContent = `pairing: ${pairing}`;
  buildRig();
});
button('blink', () => rig.blink());
button('pulse', () => rig.pulse());

function slider(label: string, value: number, onInput: (v: number) => void): void {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  wrap.appendChild(input);
  hud.appendChild(wrap);
}

slider('grade', grade, (v) => {
  grade = v;
  rig.group.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (mat?.uniforms?.uGrade) mat.uniforms.uGrade.value = v;
  });
});
slider('lid', lid, (v) => {
  lid = v;
  rig.setLid(v);
});

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

buildRig();
resize();

let last = performance.now();
renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  rig.setGazeTarget(gazeTarget);
  rig.update(t / 1000, dt, renderer, camera);
  renderer.render(scene, camera);
});
