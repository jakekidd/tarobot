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

const PARTICLE_COUNT = 220;

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
    // Spawn near the cat origin, drift OUTWARD in 3D (uniform on sphere
    // with slight upward bias) so they trail away in all directions, not
    // just on the cat's plane. Per-vertex colors give each particle its
    // own life-cycle fade.
    const particleTex = makeParticleTexture();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const lifetimes = new Float32Array(PARTICLE_COUNT);
    const lifespans = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) initParticle(i, true);

    function initParticle(i: number, spawnAlive: boolean) {
      // Tight spawn cluster near the cat's center.
      positions[i * 3 + 0] = (Math.random() - 0.5) * 0.4;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.25;

      // Uniform direction on a unit sphere (Marsaglia's method).
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const dx = r * Math.cos(theta);
      const dy = u;
      const dz = r * Math.sin(theta);

      const speed = 0.04 + Math.random() * 0.08;
      velocities[i * 3 + 0] = dx * speed;
      velocities[i * 3 + 1] = dy * speed * 0.6 + 0.015;  // slight upward bias
      velocities[i * 3 + 2] = dz * speed;

      const lifespan = 2.5 + Math.random() * 3.5;
      lifespans[i] = lifespan;
      // If spawning into a live scene (mount or after death), randomize phase
      // so particles aren't all in lockstep. Otherwise start at full life.
      lifetimes[i] = spawnAlive ? Math.random() * lifespan : lifespan;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.022,
      transparent: true,
      opacity: 1,                   // per-vertex color carries fade now
      vertexColors: true,
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

    // ─── Visibility: pause when tab hidden so we don't accumulate a
    // particle massacre when the user comes back hours later.
    let paused = document.visibilityState !== 'visible';
    const onVisibilityChange = () => {
      const nowVisible = document.visibilityState === 'visible';
      if (nowVisible && paused) {
        paused = false;
        // Reset frame timer so the first dt after resume is small.
        lastFrameMs = performance.now();
        if (rafId === 0 && mounted) {
          rafId = requestAnimationFrame(animate);
        }
      } else if (!nowVisible) {
        paused = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let rafId = 0;
    let mounted = true;
    const start = performance.now();
    let lastFrameMs = start;

    const animate = () => {
      if (!mounted) return;
      if (paused) {
        // Don't tick while hidden — stall rAF until visibility returns.
        rafId = 0;
        return;
      }
      const now = performance.now();
      const dt = Math.min((now - lastFrameMs) / 1000, 0.05); // tighter clamp
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
      // Drift along their per-particle 3D velocity. Slight gravity-ish
      // damping on the y-velocity so they slow as they rise. Per-vertex
      // RGB carries the fade — each particle has its own life curve.
      const drift = particleGeom.attributes.position.array as Float32Array;
      const vel = velocities;
      const col = particleGeom.attributes.color.array as Float32Array;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        lifetimes[i] -= dt;
        const lx = drift[i * 3 + 0]!;
        const ly = drift[i * 3 + 1]!;
        const lz = drift[i * 3 + 2]!;

        // Respawn if dead or drifted too far in any direction.
        if (lifetimes[i]! <= 0 || lx * lx + ly * ly + lz * lz > 4) {
          initParticle(i, false);
          continue;
        }

        drift[i * 3 + 0] = lx + vel[i * 3 + 0]! * dt;
        drift[i * 3 + 1] = ly + vel[i * 3 + 1]! * dt;
        drift[i * 3 + 2] = lz + vel[i * 3 + 2]! * dt;

        // Mild damping so velocity tapers — feels like dust catching air.
        vel[i * 3 + 0] = vel[i * 3 + 0]! * (1 - dt * 0.4);
        vel[i * 3 + 1] = vel[i * 3 + 1]! * (1 - dt * 0.4);
        vel[i * 3 + 2] = vel[i * 3 + 2]! * (1 - dt * 0.4);

        // Per-particle fade: peaks midlife, fades at both ends so the
        // birth/death are soft. Curve = sin(πr) where r = lifeRatio.
        const ratio = lifetimes[i]! / lifespans[i]!;
        const intensity = Math.sin(ratio * Math.PI) * 0.55;
        col[i * 3 + 0] = intensity * 0.7;   // R
        col[i * 3 + 1] = intensity * 0.53;  // G
        col[i * 3 + 2] = intensity * 1.0;   // B → violet
      }
      particleGeom.attributes.position.needsUpdate = true;
      particleGeom.attributes.color.needsUpdate = true;

      composer.render();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
