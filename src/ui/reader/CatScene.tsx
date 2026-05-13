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
  color = '#7c3aed',          // matches deeper royal violet; bloom amplifies into glow
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
      size: 0.055,                   // bigger — visibly drifting motes
      transparent: true,
      opacity: 1,                    // per-vertex color carries fade now
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
      1.4,     // strength — clearly visible halo
      0.85,    // radius — softer falloff
      0.10,    // threshold — almost everything violet blooms
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

    // ─── Mouse reactivity. The cat shifts away from the cursor when it
    // gets close, and elastically returns to center. Rapid mouse
    // movement triggers a "purr" state — eyes squint, gentle vibration.
    let mouseSceneX = 999;     // normalized scene-space; large = "no mouse"
    let mouseSceneY = 999;
    let lastMouseT = 0;
    let purrUntil = 0;
    const hoverVel = { x: 0, y: 0 };
    const hoverOffset = { x: 0, y: 0 };
    const HOVER_RADIUS = 1.3;        // scene units within which mouse "matters"
    const PUSH_STRENGTH = 0.35;       // how far the cat retreats at full push
    const SPRING_K = 9;               // pull-back stiffness
    const DAMPING = 0.86;
    const PURR_VELOCITY_TRIGGER = 1.8;  // scene-units / second
    const PURR_DURATION_MS = 700;

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // Approx scene-space scaling — at this camera & z=0, the visible
      // half-width is about 1.0; treat ndc as scene units directly.
      const sx = nx * 1.4;
      const sy = ny * 1.0;
      const now = performance.now();
      const dt = Math.max(0.001, (now - (lastMouseT || now)) / 1000);
      const dx = sx - mouseSceneX;
      const dy = sy - mouseSceneY;
      const dist = mouseSceneX > 100 ? 0 : Math.hypot(dx, dy);
      const speed = dist / dt;
      if (speed > PURR_VELOCITY_TRIGGER) {
        purrUntil = now + PURR_DURATION_MS;
      }
      mouseSceneX = sx;
      mouseSceneY = sy;
      lastMouseT = now;
    };
    const onPointerLeave = () => {
      mouseSceneX = 999;
      mouseSceneY = 999;
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

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

      // Purr state — used by frame cycling AND position jitter below.
      const purring = now < purrUntil;

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
        // Slower eye cycle overall — calmer presence; speaking still quickens it.
        const ms = (stateData.ms ?? 1500) * (fs.speaking ? 0.55 : 1.7);
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
        frame = (fs.blinking || purring) && stateData.blink
          ? stateData.blink
          : stateData.frames[fs.frameIdx] ?? stateData.frames[0]!;
      } else {
        frame = data.states.idle!.frames[0]!;
      }
      paintFrame(spriteCtx, frame, fs.color, fs.bgColor);
      tex.needsUpdate = true;

      // ── Mouse reactivity (push away + elastic return) ──
      let targetOffsetX = 0;
      let targetOffsetY = 0;
      if (mouseSceneX < 100) {
        const dx = -mouseSceneX;            // we want to push AWAY from mouse
        const dy = -mouseSceneY;
        const distFromCat = Math.hypot(mouseSceneX, mouseSceneY);
        if (distFromCat < HOVER_RADIUS) {
          const intensity = (HOVER_RADIUS - distFromCat) / HOVER_RADIUS; // 0..1
          const mag = Math.hypot(dx, dy) || 1;
          targetOffsetX = (dx / mag) * intensity * PUSH_STRENGTH;
          targetOffsetY = (dy / mag) * intensity * PUSH_STRENGTH * 0.6;
        }
      }
      // Spring toward target offset
      hoverVel.x += (targetOffsetX - hoverOffset.x) * SPRING_K * dt;
      hoverVel.y += (targetOffsetY - hoverOffset.y) * SPRING_K * dt;
      hoverVel.x *= DAMPING;
      hoverVel.y *= DAMPING;
      hoverOffset.x += hoverVel.x * dt;
      hoverOffset.y += hoverVel.y * dt;

      // ── Purr vibration (small jitter while purring) ──
      const purrJitterX = purring ? (Math.random() - 0.5) * 0.04 : 0;
      const purrJitterY = purring ? (Math.random() - 0.5) * 0.04 : 0;

      // ── Cat float + random-feel tilt ──
      const tiltZ = (
        Math.sin(t * 0.43) * 0.5 +
        Math.sin(t * 0.79) * 0.3 +
        Math.sin(t * 1.27) * 0.2
      ) * 0.06;
      const yaw = Math.sin(t * 0.31) * 0.06;
      const pitch = -0.04 + Math.sin(t * 0.46) * 0.025;

      cat.rotation.z = tiltZ;
      cat.rotation.y = yaw;
      cat.rotation.x = pitch;
      cat.position.x = Math.sin(t * 0.27) * 0.02 + hoverOffset.x + purrJitterX;
      cat.position.y = Math.sin(t * 0.55) * 0.03 + hoverOffset.y + purrJitterY;

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
        const intensity = Math.sin(ratio * Math.PI);     // peaks at 1.0
        // Violet tint matching --color-violet (#7c3aed = 124,58,237 → ~0.49,0.23,0.93).
        col[i * 3 + 0] = intensity * 0.49;
        col[i * 3 + 1] = intensity * 0.23;
        col[i * 3 + 2] = intensity * 0.93;
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
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
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
