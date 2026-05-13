import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import spriteData from '../reader/sprite.json';
import { paintFrame, type SpriteFrame } from '../reader/spriteCanvas';
import { getAnchor } from './anchorStore';
import { subscribeImpacts, type Impact as ImpactEvent } from './impactStore';

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

const CAT_COLOR = '#7c3aed';
const CAT_BG = '#000000';

const PARTICLE_COUNT = 130;
const PARTICLE_BURST_DURATION = 0.6;     // seconds; initial outward burst
const PARTICLE_BASE_OMEGA = -0.056;       // negative = clockwise; ~1/8 of prior speed
const PARTICLE_MIN_RADIUS = 0.55;         // in cat-widths
const PARTICLE_MAX_RADIUS = 1.6;
const PARTICLE_SIZE_PX = 1.5;             // ~1/4 the prior visual size
const PARTICLE_BURST_VEL = 0.19;          // initial outward velocity (~1/8 of prior burst)
const PARTICLE_BURST_VEL_JITTER = 0.19;

// ─── Data orbs ────────────────────────────────────────────
// Each survey/tent answer fires a glowing white sphere at the click point;
// it floats up to a drifting cloud above/behind Clat. Acts as a visual
// answer counter — orbs accumulate across the session.
const ORB_MAX = 60;
const ORB_RADIUS_PX = 8;
const ORB_TRAVEL_MIN_S = 1.1;
const ORB_TRAVEL_JITTER_S = 0.7;
const ORB_DRIFT_RETARGET_MIN_S = 2.0;
const ORB_DRIFT_RETARGET_JITTER_S = 4.0;

type ParticleData = {
  theta: Float32Array;
  radius: Float32Array;
  z: Float32Array;
  omega: Float32Array;         // per-particle angular velocity (clockwise)
  radialVel: Float32Array;     // for burst-out + breath
  targetRadius: Float32Array;  // spring target
  zBob: Float32Array;          // per-particle bob phase
  age: Float32Array;           // seconds since spawn
  lifespan: Float32Array;      // seconds
};

/**
 * Full-screen Three.js scene. Mounted once at app root.
 *   - Orthographic camera; world units == viewport pixels.
 *   - Reads ReaderAnchor's bbox each frame and places Clat there.
 *   - Particles are camera-facing squares that burst-out on mount, then
 *     swirl clockwise around Clat with per-particle randomness.
 *   - Mouse reactivity: cat shifts away from cursor (spring), purrs and
 *     closes eyes on rapid mouse motion.
 */
export function TarobotScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Orthographic camera — world units == viewport pixels, center-origin.
    let viewportW = window.innerWidth;
    let viewportH = window.innerHeight;
    const camera = new THREE.OrthographicCamera(
      -viewportW / 2, viewportW / 2,
       viewportH / 2, -viewportH / 2,
      0.1, 1000,
    );
    camera.position.z = 100;

    function sizeRenderer() {
      viewportW = window.innerWidth;
      viewportH = window.innerHeight;
      renderer.setSize(viewportW, viewportH);
      camera.left = -viewportW / 2;
      camera.right = viewportW / 2;
      camera.top = viewportH / 2;
      camera.bottom = -viewportH / 2;
      camera.updateProjectionMatrix();
      composer.setSize(viewportW, viewportH);
    }

    // ─── Cat mesh ─────────────────────────────────────────
    // Geometry is in normalized 1×1 cat-units; the group scales to anchor px.
    const spriteCanvas = document.createElement('canvas');
    const spriteCtx = spriteCanvas.getContext('2d')!;
    spriteCtx.imageSmoothingEnabled = false;

    const tex = new THREE.CanvasTexture(spriteCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    // PNG-cutout style: a flat plane with the sprite as its only material.
    // alphaTest discards fully-transparent pixels so the bloom/composite doesn't
    // catch a faint rectangular edge around Clat. depthWrite is left on so
    // Clat's silhouette occludes the orbs/dust drifting behind him.
    const catMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.05,
    });
    const catGeom = new THREE.PlaneGeometry(1, 1);
    const cat = new THREE.Mesh(catGeom, catMat);

    const catGroup = new THREE.Group();
    catGroup.add(cat);

    const particleGroup = new THREE.Group();

    const positionGroup = new THREE.Group();
    positionGroup.add(catGroup);
    positionGroup.add(particleGroup);
    scene.add(positionGroup);

    // Initial paint
    const firstFrame = data.states.idle!.frames[0]!;
    paintFrame(spriteCtx, firstFrame, CAT_COLOR, CAT_BG);
    tex.needsUpdate = true;

    // ─── Particles ────────────────────────────────────────
    // Camera-facing square sprites via Points + flat white-square texture.
    // Spawn at radius 0 with outward radial velocity for burst-on-appear.
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const pd: ParticleData = {
      theta: new Float32Array(PARTICLE_COUNT),
      radius: new Float32Array(PARTICLE_COUNT),
      z: new Float32Array(PARTICLE_COUNT),
      omega: new Float32Array(PARTICLE_COUNT),
      radialVel: new Float32Array(PARTICLE_COUNT),
      targetRadius: new Float32Array(PARTICLE_COUNT),
      zBob: new Float32Array(PARTICLE_COUNT),
      age: new Float32Array(PARTICLE_COUNT),
      lifespan: new Float32Array(PARTICLE_COUNT),
    };

    function initParticle(i: number, isBurst: boolean) {
      pd.theta[i] = Math.random() * Math.PI * 2;
      pd.targetRadius[i] = PARTICLE_MIN_RADIUS + Math.random() * (PARTICLE_MAX_RADIUS - PARTICLE_MIN_RADIUS);
      pd.radius[i] = isBurst ? 0.05 + Math.random() * 0.15 : pd.targetRadius[i]!;
      pd.radialVel[i] = isBurst ? PARTICLE_BURST_VEL + Math.random() * PARTICLE_BURST_VEL_JITTER : 0;
      pd.z[i] = (Math.random() - 0.5) * 0.4;
      pd.omega[i] = PARTICLE_BASE_OMEGA * (0.6 + Math.random() * 0.8);
      pd.zBob[i] = Math.random() * Math.PI * 2;
      pd.age[i] = 0;
      pd.lifespan[i] = 6 + Math.random() * 6;
    }
    for (let i = 0; i < PARTICLE_COUNT; i++) initParticle(i, true);

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleTex = makeSquareParticleTexture();
    const particleMat = new THREE.PointsMaterial({
      size: PARTICLE_SIZE_PX,         // ~1/4 of the prior visual size
      sizeAttenuation: false,         // square stays the same screen-px size
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: particleTex,
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    particleGroup.add(particles);

    // ─── Data orbs (answer counter cloud) ─────────────────
    // Persistent glowing white spheres. Spawn at click position, travel up
    // along an arc, then drift in a cloud above/behind Clat. Shared geom +
    // material — orbs are visually identical, so no per-orb material clone.
    const orbGroup = new THREE.Group();
    scene.add(orbGroup);
    const orbGeom = new THREE.SphereGeometry(ORB_RADIUS_PX, 18, 14);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    type OrbPhase = 'travel' | 'drift';
    type Orb = {
      mesh: THREE.Mesh;
      phase: OrbPhase;
      pos: THREE.Vector3;
      vel: THREE.Vector3;
      target: THREE.Vector3;
      retargetAt: number;
      // travel-only
      travelStart: THREE.Vector3;
      travelDuration: number;
      travelElapsed: number;
      arcPeak: THREE.Vector3;       // bezier control point above the midline
    };
    const orbs: Orb[] = [];

    function pickCloudPoint(out: THREE.Vector3): void {
      const a = getAnchor();
      const cx = a ? a.x - viewportW / 2 : 0;
      const cy = a ? viewportH / 2 - a.y : 0;
      const w = a ? a.width : 220;
      // Cloud: above Clat, roughly centered on the head, with horizontal spread.
      const angle = (Math.random() - 0.5) * Math.PI * 0.75;  // -67.5°..+67.5° from straight up
      const r = w * (0.55 + Math.random() * 0.85);
      const offX = Math.sin(angle) * r;
      const offY = Math.cos(angle) * r * 0.85 + w * 0.25;     // bias toward above
      const offZ = -10 - Math.random() * 20;                  // behind Clat plane (z=0)
      out.set(cx + offX, cy + offY, offZ);
    }

    const unsubscribeImpacts = subscribeImpacts((evt: ImpactEvent) => {
      // Convert client coords → scene coords (center origin, y up).
      const sx = evt.x - viewportW / 2;
      const sy = viewportH / 2 - evt.y;

      // Recycle the oldest orb if at cap.
      if (orbs.length >= ORB_MAX) {
        const old = orbs.shift()!;
        orbGroup.remove(old.mesh);
      }

      const mesh = new THREE.Mesh(orbGeom, orbMat);
      mesh.position.set(sx, sy, -5);
      orbGroup.add(mesh);

      const target = new THREE.Vector3();
      pickCloudPoint(target);

      // Bezier control point: above the midline by a chunk, biased toward target x.
      const arcPeak = new THREE.Vector3(
        sx + (target.x - sx) * 0.55,
        Math.max(sy, target.y) + 60 + Math.random() * 80,
        (target.z - 5) / 2,
      );

      orbs.push({
        mesh,
        phase: 'travel',
        pos: new THREE.Vector3(sx, sy, -5),
        vel: new THREE.Vector3(),
        target,
        retargetAt: 0,
        travelStart: new THREE.Vector3(sx, sy, -5),
        travelDuration: ORB_TRAVEL_MIN_S + Math.random() * ORB_TRAVEL_JITTER_S,
        travelElapsed: 0,
        arcPeak,
      });
    });

    // ─── Bloom ────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.85,    // strength — dialed back from 1.4
      0.8,     // radius
      0.30,    // threshold — only the brighter pixels bloom (less halo on whole cat)
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    sizeRenderer();

    // ─── Mouse reactivity ─────────────────────────────────
    let mouseSceneX = 999;       // viewport-pixel coords, center-origin
    let mouseSceneY = 999;
    let lastMouseT = 0;
    let purrUntil = 0;
    const hoverVel = { x: 0, y: 0 };
    const hoverOffset = { x: 0, y: 0 };
    const PURR_VELOCITY_TRIGGER = 1500;  // px/sec
    const PURR_DURATION_MS = 700;

    const onPointerMove = (e: PointerEvent) => {
      const sx = e.clientX - viewportW / 2;
      const sy = viewportH / 2 - e.clientY;
      const now = performance.now();
      if (lastMouseT > 0) {
        const dt = Math.max(0.001, (now - lastMouseT) / 1000);
        const dx = sx - mouseSceneX;
        const dy = sy - mouseSceneY;
        const speed = Math.hypot(dx, dy) / dt;
        if (speed > PURR_VELOCITY_TRIGGER && mouseSceneX < 998) {
          purrUntil = now + PURR_DURATION_MS;
        }
      }
      mouseSceneX = sx;
      mouseSceneY = sy;
      lastMouseT = now;
    };
    const onPointerLeave = () => {
      mouseSceneX = 999;
      mouseSceneY = 999;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', sizeRenderer);

    // ─── Sprite frame state ───────────────────────────────
    const fs = {
      state: 'idle',
      frameIdx: 0,
      blinking: false,
      nextBlinkAt: 0,
      nextFrameAt: 0,
    };

    let rafId = 0;
    let mounted = true;
    let paused = document.visibilityState !== 'visible';
    const onVisibilityChange = () => {
      const nowVisible = document.visibilityState === 'visible';
      if (nowVisible && paused) {
        paused = false;
        lastFrameMs = performance.now();
        if (rafId === 0) rafId = requestAnimationFrame(animate);
      } else if (!nowVisible) {
        paused = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const start = performance.now();
    let lastFrameMs = start;
    const _orbTmpA = new THREE.Vector3();

    const animate = () => {
      if (!mounted) return;
      if (paused) { rafId = 0; return; }
      const now = performance.now();
      const dt = Math.min((now - lastFrameMs) / 1000, 0.05);
      lastFrameMs = now;
      const t = (now - start) / 1000;

      // ── Anchor → screen position + scale ──
      const anchor = getAnchor();
      const wantVisible = anchor !== null;
      positionGroup.visible = wantVisible;

      if (anchor) {
        positionGroup.position.x = anchor.x - viewportW / 2;
        positionGroup.position.y = viewportH / 2 - anchor.y;
        positionGroup.scale.setScalar(anchor.width);
      }

      // ── Purr ──
      const purring = now < purrUntil;

      // ── Frame cycling ──
      const stateData = data.states[fs.state] ?? data.states.idle!;
      const mode = stateData.mode ?? 'shuffle';
      const cycleMs = (stateData.ms ?? 1500) * 1.4;   // a touch faster than 1.7
      if (mode !== 'hold' && stateData.frames.length > 1 && now >= fs.nextFrameAt) {
        fs.frameIdx = mode === 'loop'
          ? (fs.frameIdx + 1) % stateData.frames.length
          : Math.floor(Math.random() * stateData.frames.length);
        fs.nextFrameAt = now + cycleMs;
      }
      if (fs.state === 'idle' && stateData.blink) {
        if (fs.nextBlinkAt === 0) fs.nextBlinkAt = now + 4000 + Math.random() * 5000;
        if (!fs.blinking && now >= fs.nextBlinkAt) {
          fs.blinking = true; fs.nextBlinkAt = now + 140;
        } else if (fs.blinking && now >= fs.nextBlinkAt) {
          fs.blinking = false; fs.nextBlinkAt = now + 4000 + Math.random() * 5000;
        }
      }
      const showBlink = (fs.blinking || purring) && stateData.blink;
      const frame = showBlink ? stateData.blink! : (stateData.frames[fs.frameIdx] ?? stateData.frames[0]!);
      paintFrame(spriteCtx, frame, CAT_COLOR, CAT_BG);
      tex.needsUpdate = true;

      // ── Mouse reactivity (in cat-units; scale by anchor.width) ──
      let targetOffsetX = 0, targetOffsetY = 0;
      if (anchor && mouseSceneX < 998) {
        const catX = anchor.x - viewportW / 2;
        const catY = viewportH / 2 - anchor.y;
        const dx = mouseSceneX - catX;
        const dy = mouseSceneY - catY;
        const dist = Math.hypot(dx, dy);
        const hoverRadiusPx = anchor.width * 1.3;
        if (dist < hoverRadiusPx) {
          const intensity = (hoverRadiusPx - dist) / hoverRadiusPx;
          const mag = dist || 1;
          targetOffsetX = -(dx / mag) * intensity * 0.35;
          targetOffsetY = -(dy / mag) * intensity * 0.22;
        }
      }
      hoverVel.x += (targetOffsetX - hoverOffset.x) * 9 * dt;
      hoverVel.y += (targetOffsetY - hoverOffset.y) * 9 * dt;
      hoverVel.x *= 0.86;
      hoverVel.y *= 0.86;
      hoverOffset.x += hoverVel.x * dt;
      hoverOffset.y += hoverVel.y * dt;
      const purrJitterX = purring ? (Math.random() - 0.5) * 0.04 : 0;
      const purrJitterY = purring ? (Math.random() - 0.5) * 0.04 : 0;

      // ── Cat float + tilt + offset ──
      const tiltZ = (
        Math.sin(t * 0.43) * 0.5 +
        Math.sin(t * 0.79) * 0.3 +
        Math.sin(t * 1.27) * 0.2
      ) * 0.06;
      const yaw = Math.sin(t * 0.31) * 0.06;
      const pitch = -0.04 + Math.sin(t * 0.46) * 0.025;
      catGroup.rotation.z = tiltZ;
      catGroup.rotation.y = yaw;
      catGroup.rotation.x = pitch;
      catGroup.position.x = Math.sin(t * 0.27) * 0.02 + hoverOffset.x + purrJitterX;
      catGroup.position.y = Math.sin(t * 0.55) * 0.03 + hoverOffset.y + purrJitterY;

      // ── Particles: clockwise swirl with per-particle randomness ──
      const posArr = particleGeom.attributes.position.array as Float32Array;
      const colArr = particleGeom.attributes.color.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pd.age[i] += dt;
        if (pd.age[i]! > pd.lifespan[i]!) {
          initParticle(i, false);
          continue;
        }

        // Radial: burst-out at birth, then spring toward target radius
        pd.radius[i] += pd.radialVel[i]! * dt;
        const rError = pd.targetRadius[i]! - pd.radius[i]!;
        pd.radialVel[i] += rError * 2.0 * dt;             // spring
        pd.radialVel[i] *= 0.92;                          // damping

        // Angular: clockwise base + per-particle turbulence
        const turbulence = Math.sin(t * 0.8 + pd.zBob[i]! * 1.7) * 0.3;
        pd.theta[i] += (pd.omega[i]! + turbulence * pd.omega[i]!) * dt;

        // Z bob
        const zOffset = Math.sin(t * 0.6 + pd.zBob[i]!) * 0.1;

        const r = pd.radius[i]!;
        posArr[i * 3 + 0] = Math.cos(pd.theta[i]!) * r;
        posArr[i * 3 + 1] = Math.sin(pd.theta[i]!) * r;
        posArr[i * 3 + 2] = pd.z[i]! + zOffset;

        // Color fade: in over first 0.5s, peak, fade over last 1s of life
        const age = pd.age[i]!;
        const life = pd.lifespan[i]!;
        let intensity = 1;
        if (age < 0.5) intensity = age / 0.5;
        else if (age > life - 1) intensity = Math.max(0, (life - age));
        intensity *= 0.85;
        colArr[i * 3 + 0] = intensity * 0.49;
        colArr[i * 3 + 1] = intensity * 0.23;
        colArr[i * 3 + 2] = intensity * 0.93;
      }
      particleGeom.attributes.position.needsUpdate = true;
      particleGeom.attributes.color.needsUpdate = true;

      // ── Data orbs: travel-up arc, then drift in a cloud ──
      const orbTmp = _orbTmpA;
      for (const orb of orbs) {
        if (orb.phase === 'travel') {
          orb.travelElapsed += dt;
          const u = Math.min(1, orb.travelElapsed / orb.travelDuration);
          // Quadratic bezier: travelStart → arcPeak → target.
          const oneMinusU = 1 - u;
          orb.pos.set(
            oneMinusU * oneMinusU * orb.travelStart.x + 2 * oneMinusU * u * orb.arcPeak.x + u * u * orb.target.x,
            oneMinusU * oneMinusU * orb.travelStart.y + 2 * oneMinusU * u * orb.arcPeak.y + u * u * orb.target.y,
            oneMinusU * oneMinusU * orb.travelStart.z + 2 * oneMinusU * u * orb.arcPeak.z + u * u * orb.target.z,
          );
          orb.mesh.position.copy(orb.pos);
          if (u >= 1) {
            orb.phase = 'drift';
            orb.vel.set(0, 0, 0);
            orb.retargetAt = t + ORB_DRIFT_RETARGET_MIN_S + Math.random() * ORB_DRIFT_RETARGET_JITTER_S;
          }
        } else {
          if (t >= orb.retargetAt) {
            pickCloudPoint(orb.target);
            orb.retargetAt = t + ORB_DRIFT_RETARGET_MIN_S + Math.random() * ORB_DRIFT_RETARGET_JITTER_S;
          }
          // Spring toward target with damping + small per-frame noise.
          orbTmp.subVectors(orb.target, orb.pos).multiplyScalar(1.6);
          orb.vel.x = orb.vel.x * 0.90 + orbTmp.x * dt;
          orb.vel.y = orb.vel.y * 0.90 + orbTmp.y * dt;
          orb.vel.z = orb.vel.z * 0.90 + orbTmp.z * dt;
          orb.vel.x += (Math.random() - 0.5) * 8 * dt;
          orb.vel.y += (Math.random() - 0.5) * 8 * dt;
          orb.pos.x += orb.vel.x * dt;
          orb.pos.y += orb.vel.y * dt;
          orb.pos.z += orb.vel.z * dt;
          orb.mesh.position.copy(orb.pos);
        }
      }

      composer.render();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', sizeRenderer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribeImpacts();
      for (const orb of orbs) orbGroup.remove(orb.mesh);
      orbs.length = 0;
      orbGeom.dispose();
      orbMat.dispose();
      catGeom.dispose();
      catMat.dispose();
      tex.dispose();
      particleGeom.dispose();
      particleMat.dispose();
      particleTex.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);
  // Note: PARTICLE_BURST_DURATION currently unused — burst is implicit
  // in the radialVel decay; kept as a constant for future tuning.
  void PARTICLE_BURST_DURATION;

  return <div ref={containerRef} className="tarobot-scene" aria-hidden />;
}

// ─── Helpers ───────────────────────────────────────────────

function makeSquareParticleTexture(): THREE.CanvasTexture {
  // Plain white square — additive blending tints it to vertex color.
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 8, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
