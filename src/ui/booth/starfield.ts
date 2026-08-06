// The rainbow starfield — shared by the booth and the main menu. A
// point-sprite shader: every star gets a color sampled along one
// tasteful hue vector (teal → violet → magenta, rare gold embers) and
// its own twinkle phase. Additive blending; trippy is a core vibe
// requirement, tasteful is the constraint.

import * as THREE from 'three';

export type StarField = {
  points: THREE.Points;
  update(time: number): void;
  dispose(): void;
};

export function createStarField(pixelRatio: number, count = 1400): StarField {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const size = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = 16 + Math.random() * 24;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 6;
    const hue = Math.random() < 0.08 ? 0.11 : 0.52 + Math.random() * 0.4;
    c.setHSL(hue, 0.55 + Math.random() * 0.4, 0.55 + Math.random() * 0.25);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    phase[i] = Math.random() * Math.PI * 2;
    size[i] = Math.random() < 0.16 ? 2.8 + Math.random() * 2.6 : 1.1 + Math.random() * 1.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPx: { value: pixelRatio },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime;
      uniform float uPx;
      attribute vec3 aColor;
      attribute float aPhase;
      attribute float aSize;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = aColor;
        vTwinkle = 0.62 + 0.38 * sin(uTime * (0.5 + fract(aPhase) * 1.2) + aPhase * 7.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (0.75 + 0.5 * vTwinkle) * uPx;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.08, d);
        gl_FragColor = vec4(vColor * (0.7 + 0.6 * vTwinkle), core * (0.35 + 0.65 * vTwinkle));
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    update: (time) => {
      mat.uniforms.uTime.value = time;
      points.rotation.y = time * 0.004;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
