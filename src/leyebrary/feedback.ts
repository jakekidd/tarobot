// The ping-pong feedback loop — MilkDrop's prev-frame resample-decay
// engine on a small offscreen target. One step per rendered frame is
// the classic cadence; the output texture feeds the 'trails' look.

import * as THREE from 'three';
import { FEEDBACK_FRAG, QUAD_VERT } from './glsl';
import type { Palette } from './math';
import { writePalette } from './eyeMaterial';

const SIZE = 256;

export class FeedbackLoop {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private mat: THREE.ShaderMaterial;

  constructor(palette: Palette) {
    const opts: THREE.RenderTargetOptions = {
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    };
    this.rtA = new THREE.WebGLRenderTarget(SIZE, SIZE, opts);
    this.rtB = new THREE.WebGLRenderTarget(SIZE, SIZE, opts);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: FEEDBACK_FRAG,
      uniforms: {
        uPrev: { value: this.rtA.texture },
        uTime: { value: 0 },
        uSpeed: { value: 0.9 },
        uMode: { value: 0 },
        uPalA: { value: [new THREE.Vector3(), new THREE.Vector3()] },
        uPalB: { value: [new THREE.Vector3(), new THREE.Vector3()] },
        uPalC: { value: [new THREE.Vector3(), new THREE.Vector3()] },
        uPalD: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      },
    });
    writePalette(this.mat, 0, palette);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.position.z = -1;
    this.scene.add(quad);
  }

  get texture(): THREE.Texture {
    return this.rtA.texture;
  }

  setPalette(p: Palette): void {
    writePalette(this.mat, 0, p);
  }

  // ink field for the fresh crest-lines (glsl field() index)
  setInkMode(mode: number): void {
    this.mat.uniforms.uMode.value = mode;
  }

  step(renderer: THREE.WebGLRenderer, time: number): void {
    this.mat.uniforms.uPrev.value = this.rtA.texture;
    this.mat.uniforms.uTime.value = time;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rtB);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    const tmp = this.rtA;
    this.rtA = this.rtB;
    this.rtB = tmp;
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.mat.dispose();
  }
}
