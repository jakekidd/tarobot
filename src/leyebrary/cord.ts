// The optic cords. Each eye is fed by a fleshy stalk running back
// into the dark: the eyes are not floating, they are TETHERED, and
// the tether is alive — a peristaltic bulge travels up it toward the
// socket while the far end sways. Geometry is built once and animated
// entirely on the GPU (both motions live in CORD_VERT); the CPU-side
// twins in math.ts exist so the same motion can be asserted in tests.

import * as THREE from 'three';
import { CORD_FRAG, CORD_VERT } from './glsl';
import { CORD } from './math';

const SEGMENTS = 32;
const RADIAL = 14;

export type CordOptions = {
  phase?: number;
  length?: number;
  radius?: number;
  /** lateral bend of the far end, in units of length (+ = outward) */
  splay?: number;
  flesh?: THREE.Color;
  vein?: THREE.Color;
};

export class Cord {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(opts: CordOptions = {}) {
    const length = opts.length ?? CORD.length;
    const radius = opts.radius ?? CORD.radius;

    // The stalk leaves the socket straight back, then bends outward
    // and droops. A cord that only goes straight back is invisible
    // behind a billboarded eye; one that only goes sideways reads as
    // a horn. The bend is what makes it read as coming from behind.
    const splay = opts.splay ?? 0;
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: SEGMENTS }, (_, i) => {
        const u = i / (SEGMENTS - 1);
        // pow 1.4, not 2: the stalk must clear the eye's own silhouette
        // within the first third or it never becomes visible at all
        const bend = Math.pow(u, 1.4);
        return new THREE.Vector3(
          splay * bend * length * 0.95,
          -bend * length * 0.42,
          -u * length,
        );
      }),
    );
    const geom = new THREE.TubeGeometry(curve, SEGMENTS - 1, radius, RADIAL, false);
    taperTube(geom, curve, CORD.taper);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: CORD_VERT,
      fragmentShader: CORD_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: opts.phase ?? 0 },
        uSwell: { value: 1 },
        uSwayFreq: { value: CORD.swayFreq },
        uSwayAmp: { value: CORD.swayAmp },
        uFade: { value: 0.95 },
        uFlesh: { value: opts.flesh ?? new THREE.Color(0x5d2233) },
        uVein: { value: opts.vein ?? new THREE.Color(0xc06a86) },
      },
    });

    this.mesh = new THREE.Mesh(geom, this.mat);
    this.mesh.renderOrder = -2;
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }

  /** swell 0 stills the peristalsis; >1 makes the pump violent */
  setSwell(v: number): void {
    this.mat.uniforms.uSwell.value = v;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// TubeGeometry has a constant radius; narrow it toward the far end by
// pulling each ring's vertices in toward its own centerline.
function taperTube(geom: THREE.TubeGeometry, curve: THREE.Curve<THREE.Vector3>, taper: number): void {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    curve.getPointAt(Math.min(1, Math.max(0, u)), center);
    v.fromBufferAttribute(pos, i).sub(center).multiplyScalar(1 - taper * u).add(center);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
}
