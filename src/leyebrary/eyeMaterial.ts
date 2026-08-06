// ShaderMaterial factories for the eye quad and the membrane. All
// uniform plumbing lives here so EyeRig only thinks in looks/gaze.

import * as THREE from 'three';
import { EYE_FRAG, MEMBRANE_FRAG, QUAD_VERT } from './glsl';
import type { Palette, RoseParams, Vec3 } from './math';

const v3 = (v: Vec3): THREE.Vector3 => new THREE.Vector3(v.x, v.y, v.z);

// samplers must never be null — some drivers reject the program even
// when the sampling branch is dead
const blackTexture = (): THREE.DataTexture => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};
const BLACK = blackTexture();

export type PaletteSlot = 0 | 1;

export function writePalette(mat: THREE.ShaderMaterial, slot: PaletteSlot, p: Palette): void {
  (mat.uniforms.uPalA.value as THREE.Vector3[])[slot].set(p.a.x, p.a.y, p.a.z);
  (mat.uniforms.uPalB.value as THREE.Vector3[])[slot].set(p.b.x, p.b.y, p.b.z);
  (mat.uniforms.uPalC.value as THREE.Vector3[])[slot].set(p.c.x, p.c.y, p.c.z);
  (mat.uniforms.uPalD.value as THREE.Vector3[])[slot].set(p.d.x, p.d.y, p.d.z);
}

function paletteUniforms(p: Palette): Record<string, THREE.IUniform> {
  return {
    uPalA: { value: [v3(p.a), v3(p.a)] },
    uPalB: { value: [v3(p.b), v3(p.b)] },
    uPalC: { value: [v3(p.c), v3(p.c)] },
    uPalD: { value: [v3(p.d), v3(p.d)] },
  };
}

export function createEyeMaterial(
  palette: Palette,
  rose: RoseParams,
  phase: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: EYE_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPhase: { value: phase },
      uLid: { value: 0 },
      uPupil: { value: 0.3 },
      uEnergy: { value: 1 },
      uPulse: { value: 0 },
      uSpeedFrom: { value: 0.5 },
      uSpeedTo: { value: 0.5 },
      uModeFrom: { value: 1 },
      uModeTo: { value: 1 },
      uLookMix: { value: 1 },
      uGrade: { value: 0.75 },
      uGaze: { value: new THREE.Vector2(0, 0) },
      uRoseK: { value: new THREE.Vector3(...rose.k) },
      uRoseSpin: { value: new THREE.Vector3(...rose.spin) },
      uRosePhase: { value: new THREE.Vector3(...rose.phase) },
      uFeedback: { value: BLACK },
      ...paletteUniforms(palette),
    },
  });
}

export function createMembraneMaterial(
  palette: Palette,
  eyeL: THREE.Vector2,
  eyeR: THREE.Vector2,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: MEMBRANE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.5 },
      uLookMix: { value: 1 },
      uEyeL: { value: eyeL },
      uEyeR: { value: eyeR },
      ...paletteUniforms(palette),
    },
  });
}
