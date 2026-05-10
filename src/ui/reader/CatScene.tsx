import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import spriteData from './sprite.json';
import { paintFrame, type SpriteFrame } from './spriteCanvas';

type StateData = {
  frames: SpriteFrame[];
  blink?: SpriteFrame;
  mode?: 'shuffle' | 'loop' | 'hold';
  ms?: number;
};

type SpriteData = {
  states: Record<string, StateData>;
  reactions: Record<string, { frame: SpriteFrame }>;
};

const data = spriteData as SpriteData;

type Props = {
  state?: string;
  reaction?: string | null;
  speaking?: boolean;
  color?: string;
  bgColor?: string;
  width?: number;
  height?: number;
};

const PARTICLE_COUNT = 70;

/**
 * Floating, glowing, fairy-dust-emitting tarobot.
 * Sprite is painted to canvas → CanvasTexture → MeshBasicMaterial on a
 * box (extruded plane). Bloom postprocessing makes the cat behave as a
 * real scene light source. Particles drift upward around it.
 */
export function CatScene({
  state = 'idle',
  reaction = null,
  speaking = false,
  color = '#b388ff',
  bgColor = '#000000',
  width = 280,
  height = 280,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const frameStateRef = useRef({
    state, reaction, speaking, color, bgColor,
    frameIdx: 0,
    blinking: false,
    nextBlinkAt: 0,
    nextFrameAt: 0,
  });

  useEffect(() => {
    frameStateRef.current.state = state;
    frameStateRef.current.reaction = reaction;
    frameStateRef.current.speaking = speaking;
    frameStateRef.current.color = color;
    frameStateRef.current.bgColor = bgColor;
  }, [state, reaction, speaking, color, bgColor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Off-screen canvas for the sprite texture.
    const spriteCanvas = document.createElement('canvas');
    const spriteCtx = spriteCanvas.getContext('2d')!;
    spriteCtx.imageSmoothingEnabled = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    // Linear pass-through so the violet stays violet — no exposure boost,
    // no ACES compression. Bloom adds the only "light source" feel.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);
    camera.position.set(0, 0, 4.0);
    camera.lookAt(0, 0, 0);

    // ─── Cat mesh — square aspect (texture squished to look terminal-ish), real depth ───
    // Sprite native aspect is 2:1; displaying on a square geometry compresses
    // it horizontally to recover the terminal-cell square look the user knows.
    const planeW = 1.0;
    const planeH = 1.0;
    const planeD = 0.22;            // visible depth
    const geom = new THREE.BoxGeometry(planeW, planeH, planeD);

    const tex = new THREE.CanvasTexture(spriteCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    const front = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
    const edge = new THREE.MeshBasicMaterial({ color: 0x2a1644 });
    const back = new THREE.MeshBasicMaterial({ color: 0x1a0a30 });
    const cat = new THREE.Mesh(geom, [edge, edge, edge, edge, front, back]);
    scene.add(cat);

    // Initial paint
    const firstFrame = data.states[state]?.frames[0] ?? data.states.idle!.frames[0]!;
    paintFrame(spriteCtx, firstFrame, color, bgColor);
    tex.needsUpdate = true;

    // ─── Particles (fairy dust) ───
    const particleTex = makeParticleTexture();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const lifetimes = new Float32Array(PARTICLE_COUNT);
    const lifespans = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) initParticle(i, /*spawnInPlace=*/ true);

    function initParticle(i: number, spawnInPlace: boolean) {
      // Spawn in a vertical "fountain" zone roughly around the cat's body.
      positions[i * 3 + 0] = (Math.random() - 0.5) * 1.6;
      positions[i * 3 + 1] = spawnInPlace
        ? (Math.random() - 0.5) * 1.6
        : -0.7 - Math.random() * 0.4; // respawn at bottom
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      const lifespan = 2.5 + Math.random() * 3.5;
      lifespans[i] = lifespan;
      lifetimes[i] = spawnInPlace ? Math.random() * lifespan : lifespan;
      speeds[i] = 0.06 + Math.random() * 0.08;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xb388ff,
      size: 0.028,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      map: particleTex,
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    scene.add(particles);

    // ─── Postprocessing — real bloom so the cat is an actual light source ───
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.45,    // strength — subtle halo, not messianic glow
      0.55,    // radius
      0.55,    // threshold — only the brighter cat pixels bloom, not bg
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ─── Resize handling (optional, supports devicePixelRatio changes) ───
    const onResize = () => {
      renderer.setSize(width, height);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    let rafId = 0;
    let mounted = true;
    const start = performance.now();
    let lastFrameMs = start;

    const animate = () => {
      if (!mounted) return;
      const now = performance.now();
      const dt = Math.min((now - lastFrameMs) / 1000, 0.1);
      lastFrameMs = now;
      const t = (now - start) / 1000;

      // ── Frame cycling ──
      const fs = frameStateRef.current;
      const stateData = (fs.reaction && data.reactions[fs.reaction]?.frame
        ? null
        : data.states[fs.state] ?? data.states.idle!);

      let frame: SpriteFrame;
      if (fs.reaction && data.reactions[fs.reaction]?.frame) {
        frame = data.reactions[fs.reaction]!.frame;
      } else if (stateData) {
        const mode = stateData.mode ?? 'shuffle';
        const ms = (stateData.ms ?? 1500) * (fs.speaking ? 0.4 : 1);
        if (mode !== 'hold' && stateData.frames.length > 1 && now >= fs.nextFrameAt) {
          fs.frameIdx = mode === 'loop'
            ? (fs.frameIdx + 1) % stateData.frames.length
            : Math.floor(Math.random() * stateData.frames.length);
          fs.nextFrameAt = now + ms;
        }
        if (fs.state === 'idle' && stateData.blink) {
          if (fs.nextBlinkAt === 0) fs.nextBlinkAt = now + 4000 + Math.random() * 5000;
          if (!fs.blinking && now >= fs.nextBlinkAt) {
            fs.blinking = true;
            fs.nextBlinkAt = now + 140;
          } else if (fs.blinking && now >= fs.nextBlinkAt) {
            fs.blinking = false;
            fs.nextBlinkAt = now + 4000 + Math.random() * 5000;
          }
        } else {
          fs.blinking = false;
        }
        frame = fs.blinking && stateData.blink
          ? stateData.blink
          : stateData.frames[fs.frameIdx] ?? stateData.frames[0]!;
      } else {
        frame = data.states.idle!.frames[0]!;
      }
      paintFrame(spriteCtx, frame, fs.color, fs.bgColor);
      tex.needsUpdate = true;

      // ── Cat float + random-feel tilt ──
      // Multi-sine mix gives an almost-Perlin random feel without the dep.
      const tiltZ = (
        Math.sin(t * 0.43) * 0.5 +
        Math.sin(t * 0.79) * 0.3 +
        Math.sin(t * 1.27) * 0.2
      ) * 0.06;                              // gentle left/right wobble
      const yaw = Math.sin(t * 0.31) * 0.06; // tiny yaw
      const pitch = -0.04 + Math.sin(t * 0.46) * 0.025;

      cat.rotation.z = tiltZ;
      cat.rotation.y = yaw;
      cat.rotation.x = pitch;
      cat.position.y = Math.sin(t * 0.55) * 0.03;
      cat.position.x = Math.sin(t * 0.27) * 0.02;

      // ── Particles ──
      const drift = particleGeom.attributes.position.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        lifetimes[i] -= dt;
        if (lifetimes[i] <= 0 || drift[i * 3 + 1]! > 1.1) {
          initParticle(i, false);
        }
        const baseY = drift[i * 3 + 1]!;
        drift[i * 3 + 1] = baseY + speeds[i]! * dt;
        // gentle horizontal sway based on phase
        drift[i * 3 + 0] = drift[i * 3 + 0]! + Math.sin(t * 0.8 + phases[i]!) * 0.0008;
      }
      particleGeom.attributes.position.needsUpdate = true;

      // Fade based on average lifetime ratio (looks better than per-vertex)
      let avgRatio = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        avgRatio += lifetimes[i]! / lifespans[i]!;
      }
      avgRatio /= PARTICLE_COUNT;
      particleMat.opacity = 0.3 + avgRatio * 0.25;

      composer.render();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      geom.dispose();
      front.dispose();
      edge.dispose();
      back.dispose();
      tex.dispose();
      particleTex.dispose();
      particleGeom.dispose();
      particleMat.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="cat-scene" style={{ width, height }} />;
}

function makeParticleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
