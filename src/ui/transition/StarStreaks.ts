// Radial hyperspace star-streak field, fullscreen plane behind the
// scene. Technique is the same shape as the user's ubitel onboarding
// streaks (radial outward streaks from a center, hash-randomized
// per-star angle/speed/brightness, head/tail elongation that grows
// with distance, birth/edge fades on phase) — re-implemented here
// with the tarobot palette: violet + turquoise + white accents.
//
// Exposes a single uIntensity uniform the caller drives 0..1 to fade
// the field in/out without re-creating geometry. Cost is one fullscreen
// pass; on mobile it's a single sin + loop unroll per fragment.

import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Star count. 140 lands well on a typical phone GPU; bump to 200 on
// desktop if you want denser.
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform float uIntensity;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float h1(float n) { return hash(vec2(n, n * 1.3)); }

  // Violet + turquoise palette with rare white accents.
  vec3 starColor(float h) {
    if (h < 0.30)      return vec3(0.655, 0.545, 0.980);   // light violet  #a78bfa
    else if (h < 0.55) return vec3(0.133, 0.827, 0.933);   // turquoise     #22d3ee
    else if (h < 0.75) return vec3(0.769, 0.710, 0.992);   // pale violet   #c4b5fd
    else if (h < 0.90) return vec3(0.024, 0.714, 0.831);   // deep turquoise #06b6d4
    else               return vec3(1.000, 1.000, 1.000);   // white accent
  }

  vec3 hyperspace(vec2 uv, vec2 center, float t) {
    vec3 acc = vec3(0.0);
    const int N = 140;
    for (int i = 0; i < N; ++i) {
      float fi = float(i);

      // Per-star randomness.
      float ang   = h1(fi * 0.73) * 6.2831853;
      float sPos  = h1(fi * 1.7);
      float sSpd  = h1(fi * 3.1);
      float sWid  = h1(fi * 7.9);
      float sHue  = h1(fi * 9.7);
      float sBri  = h1(fi * 11.3);
      vec2 dir = vec2(cos(ang), sin(ang));

      // Travel from near-center outward.
      float startR = mix(0.005, 0.06, sPos);
      float endR   = mix(0.6, 1.45, sPos);
      float speed  = mix(0.3, 1.0, sSpd);
      float phase  = fract(t * speed + sPos);
      float headR  = startR + phase * (endR - startR);

      // Streak length grows with distance from center.
      float elong = smoothstep(0.0, 0.5, headR) * mix(0.08, 0.26, sPos);
      float tailR = max(0.0, headR - elong);

      vec2 pHead = center + dir * headR;
      vec2 pTail = center + dir * tailR;
      vec2 seg   = pHead - pTail;
      float segLen = length(seg);
      if (segLen < 1e-5) continue;
      vec2 segDir = seg / segLen;

      vec2 rel = uv - pTail;
      float along = dot(rel, segDir);
      float perp  = length(rel - segDir * clamp(along, 0.0, segLen));
      if (along < -0.001 || along > segLen + 0.001) continue;

      // Thin core; slightly fatter for far-out streaks.
      float baseW = mix(0.0008, 0.0022, sWid);
      float width = baseW + headR * 0.001;
      float core  = exp(-(perp * perp) / (width * width));

      // Brighter at the head.
      float u = clamp(along / max(segLen, 0.001), 0.0, 1.0);
      float headBias = mix(0.3, 1.0, u * u);

      // Fade in at birth, fade out at edges.
      float birthFade = smoothstep(0.0, 0.08, phase);
      float edgeFade  = smoothstep(1.0, 0.7, phase);

      float bright = mix(0.45, 1.0, sBri);
      acc += core * headBias * birthFade * edgeFade * bright * starColor(sHue);
    }

    // Soft center glow (violet-turquoise blend).
    float r = length(uv - center);
    float gNear = exp(-(r * r) / (0.025 * 0.025));
    acc += gNear * vec3(0.60, 0.45, 0.95) * 0.55;
    float gFar  = exp(-(r * r) / (0.13 * 0.13));
    acc += gFar  * vec3(0.20, 0.60, 0.80) * 0.10;

    return acc;
  }

  void main() {
    vec2 uv = vUv;
    vec2 corrected = vec2((uv.x - 0.5) * uAspect + 0.5, uv.y);
    vec2 center = vec2(0.5, 0.5);
    vec3 streaks = hyperspace(corrected, center, uTime);
    vec3 col = streaks * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export type StarStreaks = {
  /** Add to scene; remove on dispose. */
  mesh: THREE.Mesh;
  /** 0..1 — fades the streaks in/out without remounting. */
  setIntensity: (v: number) => void;
  /** Call per frame with seconds-since-mount. */
  update: (t: number) => void;
  /** Call on resize so aspect stays right. */
  resize: (w: number, h: number) => void;
  /** Camera-bound depth: render this BEHIND scene content. */
  attachUnderscene: (cameraZ: number) => void;
  dispose: () => void;
};

export function createStarStreaks(): StarStreaks {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0 },
      uAspect:    { value: 1 },
      uIntensity: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  // Render first, behind everything else.
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;

  function setIntensity(v: number): void {
    material.uniforms.uIntensity.value = THREE.MathUtils.clamp(v, 0, 1);
  }
  function update(t: number): void {
    material.uniforms.uTime.value = t;
  }
  function resize(w: number, h: number): void {
    // Plane scales to fill the orthographic frustum.
    mesh.scale.set(w, h, 1);
    material.uniforms.uAspect.value = w / Math.max(h, 1);
  }
  function attachUnderscene(cameraZ: number): void {
    // Sit just inside the far plane so it doesn't fight anything else
    // in the scene depth-wise (depthTest is off anyway, but tidy).
    mesh.position.z = -Math.abs(cameraZ) * 5;
  }
  function dispose(): void {
    geometry.dispose();
    material.dispose();
    if (mesh.parent) mesh.parent.remove(mesh);
  }

  return { mesh, setIntensity, update, resize, attachUnderscene, dispose };
}
