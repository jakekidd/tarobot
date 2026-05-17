import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import spriteData from '../reader/sprite.json';
import { paintFrame, type SpriteFrame } from '../reader/spriteCanvas';
import { getAnchor } from './anchorStore';
import { subscribeImpacts, type Impact as ImpactEvent } from './impactStore';
import { subscribeDizzy } from './dizzyStore';
import { subscribeReaderMode, type ReaderMode } from './readerModeStore';
import { getTableAnchor } from './tableAnchorStore';
import {
  subscribeCardScene,
  type CardSceneState,
  type CardStage,
  type SlotName,
} from './cardSceneStore';
import { registerPicker, unregisterPicker } from './pickService';
import { cardBackTexture, cardFaceTexture, disposeCardTextures } from '../cards/cardTexture';

// Reverted from the voxel approach (it merged into a featureless silhouette —
// the eye gaps disappeared into the surrounding side faces). Back to a flat
// textured plane so Clat has a face. To recover some sense of depth, a second
// plane sits at z = -CAT_DEPTH carrying the same texture; rotation reveals a
// parallax offset between the two layers. Proper extrusion-from-silhouette is
// a follow-up — see spriteGeometry.ts for the dormant voxel builder.
const CAT_DEPTH = 0.16;

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

// Time-based intro: when the page first loads Clat zooms in from a tiny dot
// to full scale. Once-per-session (the scene only mounts once at app boot).
const ZOOM_IN_DURATION_MS = 1100;
const ZOOM_IN_START_SCALE = 0.12;

const PARTICLE_COUNT = 130;
const PARTICLE_BURST_DURATION = 0.6;     // seconds; initial outward burst
const PARTICLE_BASE_OMEGA = -0.0056;      // negative = clockwise; ~1/10 of prior pass (very slow drift)

// "Dizzy" state — fires while a blocking LLM call is in flight. Eyes cycle
// through the 8 look-directions for a spin effect; dust ramps to ~10× the
// baseline omega clockwise, holds, then brakes fast when dizzy releases.
const DIZZY_PEAK_MULTIPLIER = 10;
const DIZZY_RAMP_UP_RATE = 0.05;          // per-frame lerp toward peak (slow start)
const DIZZY_RAMP_DOWN_RATE = 0.25;        // per-frame lerp toward baseline (fast brake)
const DIZZY_EYE_FRAME_MS = 80;            // ms per eye-spin frame
// look-direction frame indices in clockwise order from "up":
//   2 up, 7 up-right, 5 right, 9 down-right, 3 down, 8 down-left, 4 left, 6 up-left
const DIZZY_EYE_CYCLE = [2, 7, 5, 9, 3, 8, 4, 6];
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
const ORB_RADIUS_PX = 1;                  // ~1/8 of the previous pass — tiny stars, bloom-amplified
const ORB_TRAVEL_MIN_S = 1.1;
const ORB_TRAVEL_JITTER_S = 0.7;
const ORB_DRIFT_RETARGET_MIN_S = 2.0;
const ORB_DRIFT_RETARGET_JITTER_S = 4.0;
const ORB_OPACITY_MIN = 0.30;
const ORB_OPACITY_RANGE = 0.40;           // each orb picks baseOpacity in [MIN, MIN+RANGE]
const ORB_FLICKER_RATE = 0.10;            // rad/s — full sine cycle ~63s (≈ a minute)
const ORB_FLICKER_AMP = 0.45;             // how much of baseOpacity modulates (0..1)
const ORB_REPULSE_RADIUS_PX = 26;
const ORB_REPULSE_STRENGTH = 220;         // px/s² at zero distance

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
    // Flat textured-plane Clat. The canvas is repainted from the active sprite
    // frame each tick the frame index changes; the back plane shares the same
    // texture so updates appear on both. alphaTest keeps the transparent
    // padding around the sprite from leaving a visible plane edge.
    const spriteCanvas = document.createElement('canvas');
    const spriteCtx = spriteCanvas.getContext('2d')!;
    spriteCtx.imageSmoothingEnabled = false;

    const tex = new THREE.CanvasTexture(spriteCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    const catMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.05,
    });
    const catGeom = new THREE.PlaneGeometry(1, 1);

    // Two planes carrying the same texture: the back plane sits CAT_DEPTH
    // behind the front one. From any non-zero yaw/pitch the offset becomes
    // visible as a thin parallax slab — gives a hint of dimensionality
    // without losing the face details.
    const catFront = new THREE.Mesh(catGeom, catMat);
    catFront.position.z = 0;
    const catBack = new THREE.Mesh(catGeom, catMat);
    catBack.position.z = -CAT_DEPTH;

    const catGroup = new THREE.Group();
    catGroup.add(catBack);          // draw back first so the front overlays it
    catGroup.add(catFront);
    let lastFrameIdx = -1;

    // ─── Eyes (alternative face — the seer) ──────────────
    // Two flat planes textured by a per-eye canvas, plus a dark
    // cloak/hood silhouette plane behind them. The hood is what gives
    // the seer a shape beyond two floating spheres.
    const eyesGroup = new THREE.Group();
    const EYE_W = 0.36;
    const EYE_H = 0.27;
    const EYE_SEP = 0.62;
    const eyeGeom = new THREE.PlaneGeometry(EYE_W, EYE_H);

    // ── Cloak silhouette plane (sits behind the eyes) ──
    const cloakCanvas = document.createElement('canvas');
    cloakCanvas.width = 320;
    cloakCanvas.height = 380;
    const cloakCtx = cloakCanvas.getContext('2d')!;
    paintCloak(cloakCtx);
    const cloakTex = new THREE.CanvasTexture(cloakCanvas);
    cloakTex.colorSpace = THREE.SRGBColorSpace;
    cloakTex.minFilter = THREE.LinearFilter;
    cloakTex.magFilter = THREE.LinearFilter;
    cloakTex.generateMipmaps = false;
    const cloakMat = new THREE.MeshBasicMaterial({
      map: cloakTex,
      transparent: true,
      depthWrite: false,
    });
    // Raised slightly so the hood sits closer to the eyes; cloak still
    // extends well off the bottom of the canvas to cover the dialogue
    // overlay area.
    const cloakGeom = new THREE.PlaneGeometry(3.6, 5.4);
    const cloakMesh = new THREE.Mesh(cloakGeom, cloakMat);
    cloakMesh.position.set(0, -1.85, -0.04);
    eyesGroup.add(cloakMesh);

    function makeEye(): {
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
      canvas: HTMLCanvasElement;
      ctx: CanvasRenderingContext2D;
      tex: THREE.CanvasTexture;
    } {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 188;          // matches EYE_W/EYE_H aspect (~0.73)
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(eyeGeom, mat);
      return { mesh, mat, canvas, ctx, tex };
    }

    const leftEye = makeEye();
    const rightEye = makeEye();
    leftEye.mesh.position.set(-EYE_SEP / 2, 0.02, 0);
    rightEye.mesh.position.set(EYE_SEP / 2, 0.02, 0);
    eyesGroup.add(leftEye.mesh);
    eyesGroup.add(rightEye.mesh);
    eyesGroup.visible = false;

    /** Paint one eye onto its canvas for the current frame. */
    function paintEye(
      ctx: CanvasRenderingContext2D,
      timeSec: number,
      mood: 'calm' | 'thinking',
      jitter: number,                  // 0..1 per-eye phase offset
    ) {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const rx = W * 0.46;
      const ry = H * 0.46;

      // Outer halo — soft radial gradient ellipse, almost the whole eye
      const halo = ctx.createRadialGradient(cx, cy, ry * 0.08, cx, cy, rx);
      halo.addColorStop(0.00, 'rgba(248, 240, 255, 1.0)');
      halo.addColorStop(0.35, 'rgba(201, 165, 255, 0.95)');
      halo.addColorStop(0.75, 'rgba(124, 58, 237, 0.45)');
      halo.addColorStop(1.00, 'rgba(80, 30, 160, 0.0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupil — by mood
      if (mood === 'thinking') {
        // Animated spiral. Rotates slowly; gentle radial scale pulse.
        const spiralR = Math.min(rx, ry) * 0.55;
        const rot = timeSec * 1.6 + jitter * Math.PI * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        // Dark fill behind the spiral so it pops
        ctx.fillStyle = 'rgba(12, 4, 28, 0.85)';
        ctx.beginPath();
        ctx.arc(0, 0, spiralR * 0.95, 0, Math.PI * 2);
        ctx.fill();

        // The spiral itself — ink-on-dark
        ctx.strokeStyle = 'rgba(228, 210, 255, 0.95)';
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const turns = 3.2;
        const steps = 220;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const theta = u * turns * Math.PI * 2;
          const r = u * spiralR;
          const x = Math.cos(theta) * r;
          const y = Math.sin(theta) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        // Calm — larger dark pupil with generous wander room. Two
        // independent low-freq sines on each axis = naturalistic drift.
        const pupilR = Math.min(rx, ry) * 0.38;
        const wanderX = rx * 0.22;
        const wanderY = ry * 0.18;
        const driftX = (
          Math.sin(timeSec * 0.31 + jitter * 6.28) * 0.65 +
          Math.sin(timeSec * 0.83 + jitter * 3.14) * 0.35
        ) * wanderX;
        const driftY = (
          Math.cos(timeSec * 0.27 + jitter * 6.28) * 0.65 +
          Math.cos(timeSec * 0.71 + jitter * 1.57) * 0.35
        ) * wanderY;
        ctx.fillStyle = 'rgba(12, 4, 28, 0.95)';
        ctx.beginPath();
        ctx.ellipse(cx + driftX, cy + driftY, pupilR, pupilR, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const particleGroup = new THREE.Group();

    const positionGroup = new THREE.Group();
    positionGroup.add(catGroup);
    positionGroup.add(eyesGroup);
    positionGroup.add(particleGroup);
    scene.add(positionGroup);

    // Reader mode subscription — flips which face is shown at the anchor.
    let readerMode: ReaderMode = 'cat';
    const unsubscribeReaderMode = subscribeReaderMode((m) => { readerMode = m; });

    // Eyes blink state — independent of Clat's sprite-frame blink, since
    // 'eyes' mode has no spritesheet.
    const eyesBlink = {
      blinking: false,
      nextAt: 0,
      endsAt: 0,
      durMs: 200,
    };

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
    // Shared geometry (cheap). Materials are PER-ORB so each can flicker on its
    // own sine phase + carry a unique baseOpacity.
    const orbGeom = new THREE.SphereGeometry(ORB_RADIUS_PX, 10, 8);

    type OrbPhase = 'travel' | 'drift';
    type Orb = {
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
      phase: OrbPhase;
      pos: THREE.Vector3;
      vel: THREE.Vector3;
      target: THREE.Vector3;
      retargetAt: number;
      // travel-only
      travelStart: THREE.Vector3;
      travelDuration: number;
      travelElapsed: number;
      arcPeak: THREE.Vector3;
      // visual variation
      baseOpacity: number;
      flickerPhase: number;
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
        old.mat.dispose();
      }

      const baseOpacity = ORB_OPACITY_MIN + Math.random() * ORB_OPACITY_RANGE;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(orbGeom, mat);
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
        mat,
        phase: 'travel',
        pos: new THREE.Vector3(sx, sy, -5),
        vel: new THREE.Vector3(),
        target,
        retargetAt: 0,
        travelStart: new THREE.Vector3(sx, sy, -5),
        travelDuration: ORB_TRAVEL_MIN_S + Math.random() * ORB_TRAVEL_JITTER_S,
        travelElapsed: 0,
        arcPeak,
        baseOpacity,
        flickerPhase: Math.random() * Math.PI * 2,
      });
    });

    // ─── Perspective layer (table + cards) ───────────────
    // Lives in the SAME canvas as the ortho scene above. Rendered to the
    // table-anchor rect (scissored sub-viewport). When no anchor is set
    // (menu / survey), the perspective render is skipped entirely.

    const perspScene = new THREE.Scene();
    const perspCamera = new THREE.PerspectiveCamera(34, 1, 0.05, 80);
    // Seated POV — lookAt sits above the tabletop so the table reads
    // in the lower portion of the canvas. Small pull-back from the
    // previous "too close" pass.
    perspCamera.position.set(0, 4.6, 7.4);
    perspCamera.lookAt(0, 1.0, 0);

    // ── Lighting ───────────────────────────────────────
    // Warm key from above (the "orb" that hovers over a real tarot table)
    // + cool purple hemisphere ambient so the cloth's drape stays
    // legible all the way down to its pooling at the floor. The fill
    // light below catches the underside of the cloth so the table
    // doesn't read as a flat red circle.
    perspScene.add(new THREE.HemisphereLight(0x4030a0, 0x331515, 0.55));

    const orbLight = new THREE.PointLight(0xffd9a8, 2.4, 9, 1.6);
    orbLight.position.set(0, 3.0, 0.4);
    perspScene.add(orbLight);

    const underFill = new THREE.PointLight(0x6b3aa8, 0.65, 7, 1.8);
    underFill.position.set(0, -1.8, 1.4);
    perspScene.add(underFill);

    // ── Cards constants (define before table loader so SURFACE_Y is in scope) ──
    const CARD_W = 0.84;
    const CARD_H = 1.26;
    const CARD_THICK = 0.01;
    const SURFACE_Y = 0.072;          // y where cards rest

    // ── Table (GLB) ────────────────────────────────────
    // The GLB is a lathed cloth-on-rigid-top set, native dims:
    //   tableRadius = 0.55, tableHeight = 0.75 (crown ~0.77)
    // Scale up to match the world coords cards expect, and shift so the
    // cloth crown lands just below SURFACE_Y so cards rest on it.
    const GLB_RADIUS = 0.55;
    const GLB_CROWN_Y = 0.77;
    const TABLE_TARGET_RADIUS = 2.55;
    const TABLE_SCALE = TABLE_TARGET_RADIUS / GLB_RADIUS;   // ~4.64

    const tableGroup = new THREE.Group();
    tableGroup.visible = false;       // toggled by cardSceneStore subscriber
    perspScene.add(tableGroup);
    const tableMeshes: THREE.Mesh[] = [];

    const loader = new GLTFLoader();
    loader.load(
      '/tarot_table.glb',
      (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(TABLE_SCALE);
        const crownAfterScale = TABLE_SCALE * GLB_CROWN_Y;
        model.position.y = (SURFACE_Y - 0.005) - crownAfterScale;
        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            tableMeshes.push(obj);
          }
        });
        tableGroup.add(model);
      },
      undefined,
      (err) => {
        console.error('[tarobot] failed to load tarot_table.glb', err);
      },
    );

    const SLOT_POS: Record<SlotName, [number, number]> = {
      top:    [0, -1.05],
      left:   [-1.25, 0],
      right:  [1.25, 0],
      bottom: [0, 1.05],
    };
    // Lifted card — camera at z=7.4, +z toward viewer in three.js, so
    // smaller z = further from camera. Continuing in the user's
    // "yes more" direction: z 3.8 → 2.6 (now ~4.8 units in front of
    // camera). Still tilted toward viewer to catch the warm key light.
    const LIFT_POS = new THREE.Vector3(0, 1.4, 2.6);
    const STAGE_QUAT: Record<CardStage, THREE.Quaternion> = {
      face_down: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      face_up:   new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
      lifted:    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0, 0)),
    };
    const STAGE_MS: Record<CardStage, number> = {
      face_down: 700, face_up: 700, lifted: 950,   // lift gets longer to read the arc
    };

    const cardGeom = new THREE.PlaneGeometry(CARD_W, CARD_H);

    type CardRig = {
      slot: SlotName;
      group: THREE.Group;
      frontMesh: THREE.Mesh;
      backMesh: THREE.Mesh;
      frontMat: THREE.MeshBasicMaterial;
      backMat: THREE.MeshBasicMaterial;
      stage: CardStage;
      tweenStart: number;
      tweenDur: number;
      fromPos: THREE.Vector3;
      fromQuat: THREE.Quaternion;
      toPos: THREE.Vector3;
      toQuat: THREE.Quaternion;
    };

    const SLOTS: SlotName[] = ['top', 'left', 'right', 'bottom'];
    const cardRigs: CardRig[] = SLOTS.map((slot) => {
      const xy = SLOT_POS[slot];
      const frontMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 });
      const backMat = new THREE.MeshBasicMaterial({ map: cardBackTexture() });
      const front = new THREE.Mesh(cardGeom, frontMat);
      const back = new THREE.Mesh(cardGeom, backMat);
      back.rotation.y = Math.PI;
      front.position.z = CARD_THICK / 2;
      back.position.z = -CARD_THICK / 2;
      front.userData.slot = slot;
      back.userData.slot = slot;
      const group = new THREE.Group();
      group.add(front);
      group.add(back);
      group.position.set(xy[0], SURFACE_Y, xy[1]);
      group.quaternion.copy(STAGE_QUAT.face_down);
      group.visible = false;     // hidden until a reading mounts
      perspScene.add(group);
      const fromPos = group.position.clone();
      const fromQuat = group.quaternion.clone();
      return {
        slot,
        group, frontMesh: front, backMesh: back,
        frontMat, backMat,
        stage: 'face_down',
        tweenStart: 0, tweenDur: 1,
        fromPos, fromQuat,
        toPos: fromPos.clone(), toQuat: fromQuat.clone(),
      };
    });

    // ── Card scene subscription ────────────────────
    let cardScene: CardSceneState = { drawn: null, stages: {}, pickable: false };
    const unsubscribeCardScene = subscribeCardScene((s) => {
      // Drawn changed → re-bind face textures
      if (s.drawn !== cardScene.drawn) {
        if (s.drawn) {
          for (const dc of s.drawn.cards) {
            const rig = cardRigs.find((r) => r.slot === dc.position.id);
            if (!rig) continue;
            rig.frontMat.map = cardFaceTexture(dc.card);
            rig.frontMat.needsUpdate = true;
            rig.group.visible = true;
          }
          tableGroup.visible = true;
        } else {
          for (const rig of cardRigs) rig.group.visible = false;
          tableGroup.visible = false;
        }
      }
      cardScene = s;
    });

    // Raycaster for slot picking. Registered via pickService; TableAnchor
    // forwards pointerdown to pickAt.
    const raycaster = new THREE.Raycaster();
    function pickAt(clientX: number, clientY: number): SlotName | null {
      if (!cardScene.pickable) return null;
      const rect = getTableAnchor();
      if (!rect) return null;
      const ndcX = ((clientX - rect.x) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.y) / rect.height) * 2 + 1;
      perspCamera.aspect = rect.width / rect.height;
      perspCamera.updateProjectionMatrix();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), perspCamera);
      const pickable: THREE.Object3D[] = [];
      for (const rig of cardRigs) {
        if (rig.stage !== 'face_down' || !rig.group.visible) continue;
        pickable.push(rig.frontMesh, rig.backMesh);
      }
      const hits = raycaster.intersectObjects(pickable, false);
      for (const h of hits) {
        const slot = h.object.userData.slot as SlotName | undefined;
        if (slot) return slot;
      }
      return null;
    }
    registerPicker(pickAt);

    // ─── Composer (ortho only) ────────────────────────────
    // The perspective layer renders DIRECTLY to canvas after composer.render(),
    // scissored. Trying to embed it as a composer Pass was breaking buffer
    // state for bloom; layering it via a second renderer.render() call on the
    // already-composited canvas is cleaner and more predictable. Trade-off:
    // perspective doesn't get bloom applied. Fine for now (table is dark, card
    // emoji aren't bright enough to need bloom).
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.85,
      0.8,
      0.30,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    sizeRenderer();

    // ─── Mouse reactivity ─────────────────────────────────
    // Two coupled behaviors:
    //   1. Hover drift — Clat continuously springs away from the cursor when
    //      it's inside his "hitbox" (hover radius scales with anchor width).
    //   2. Allergic vibration — after the cursor has dwelt in that hitbox for
    //      VIBRATE_DWELL_S seconds, Clat looks up, snaps back to center, and
    //      jitters left-right very subtly for VIBRATE_DURATION_S. Cooldown
    //      prevents back-to-back episodes.
    let mouseSceneX = 999;             // viewport-pixel coords, center-origin
    let mouseSceneY = 999;
    const hoverVel = { x: 0, y: 0 };
    const hoverOffset = { x: 0, y: 0 };
    const tiltVel = { x: 0, y: 0 };    // for the mouse-bias tilt spring
    const tiltOffset = { x: 0, y: 0 };
    let hoverDwellSec = 0;             // accumulates while cursor is inside hitbox
    let vibrateUntilMs = 0;            // > now means actively vibrating
    let vibrateLastFiredAt = -999;     // seconds
    const VIBRATE_DWELL_S = 3.2;
    const VIBRATE_DURATION_S = 1.5;
    const VIBRATE_COOLDOWN_S = 2.5;

    const onPointerMove = (e: PointerEvent) => {
      mouseSceneX = e.clientX - viewportW / 2;
      mouseSceneY = viewportH / 2 - e.clientY;
    };
    const onPointerLeave = () => {
      mouseSceneX = 999;
      mouseSceneY = 999;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', sizeRenderer);

    // ─── Dizzy state ──────────────────────────────────────
    // Subscribed to dizzyStore. While true, the eyes spin and the dust ramps
    // to ~10× clockwise speed. Ramp-up is slow; the brake on release is fast.
    let dizzy = false;
    let dizzyMultiplier = 1;
    let dizzyEnteredAt = 0;
    const unsubscribeDizzy = subscribeDizzy((v) => {
      if (v && !dizzy) dizzyEnteredAt = performance.now();
      dizzy = v;
    });

    // ─── Sprite frame state ───────────────────────────────
    // Frame index 0 of the idle state is the blink (eyes closed) — handled by
    // an independent blink algorithm below. Indices 1..9 are look directions.
    const fs = {
      state: 'idle',
      shuffleIdx: 1,             // current "look around" frame; never 0
      nextShuffleAt: 0,
      blinking: false,
      nextBlinkAtMs: 0,
      blinkEndAtMs: 0,
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

      // ── Anchor → screen position + scale (with one-shot zoom-in) ──
      const anchor = getAnchor();
      const wantVisible = anchor !== null;
      positionGroup.visible = wantVisible;
      // Reader mode: show one face at the anchor; never both.
      catGroup.visible = readerMode === 'cat';
      eyesGroup.visible = readerMode === 'eyes';

      // ── Eyes: blink + per-frame canvas paint with current mood ───
      if (eyesGroup.visible) {
        // Blink less often, with random fast/slow duration.
        //   fast blink (~60% of the time):   180 ± 80 ms
        //   slow blink (~40% of the time):   420 ± 140 ms
        //   interval between blinks: 3500–8500 ms
        if (eyesBlink.nextAt === 0) {
          eyesBlink.nextAt = now + 3500 + Math.random() * 5000;
        }
        if (!eyesBlink.blinking && now >= eyesBlink.nextAt) {
          eyesBlink.blinking = true;
          const slow = Math.random() < 0.40;
          const dur = slow ? 420 + Math.random() * 140 : 180 + Math.random() * 80;
          eyesBlink.endsAt = now + dur;
          eyesBlink.durMs = dur;
        } else if (eyesBlink.blinking && now >= eyesBlink.endsAt) {
          eyesBlink.blinking = false;
          eyesBlink.nextAt = now + 3500 + Math.random() * 5000;
        }
        let sy = 1;
        if (eyesBlink.blinking) {
          const u = 1 - (eyesBlink.endsAt - now) / eyesBlink.durMs;
          sy = u < 0.5 ? 1 - u * 2 : (u - 0.5) * 2;
          sy = Math.max(0.05, sy);
        }
        leftEye.mesh.scale.y = sy;
        rightEye.mesh.scale.y = sy;

        // Mood: dizzy (any tier awaiting) → thinking spiral; else calm.
        const mood: 'calm' | 'thinking' = dizzy ? 'thinking' : 'calm';
        paintEye(leftEye.ctx, t, mood, 0.0);
        paintEye(rightEye.ctx, t, mood, 0.37);
        leftEye.tex.needsUpdate = true;
        rightEye.tex.needsUpdate = true;
      }

      const elapsedSinceMount = now - start;
      let zoomScale = 1;
      if (elapsedSinceMount < ZOOM_IN_DURATION_MS) {
        const u = elapsedSinceMount / ZOOM_IN_DURATION_MS;
        const ease = 1 - Math.pow(1 - u, 3);   // ease-out cubic
        zoomScale = ZOOM_IN_START_SCALE + (1 - ZOOM_IN_START_SCALE) * ease;
      }

      if (anchor) {
        positionGroup.position.x = anchor.x - viewportW / 2;
        positionGroup.position.y = viewportH / 2 - anchor.y;
        positionGroup.scale.setScalar(anchor.width * zoomScale);
      }

      // ── Hover hitbox: distance + dwell accumulation ──
      let mouseClose = false;
      let mouseDx = 0, mouseDy = 0;
      let hoverIntensity = 0;
      if (anchor && mouseSceneX < 998) {
        const catX = anchor.x - viewportW / 2;
        const catY = viewportH / 2 - anchor.y;
        mouseDx = mouseSceneX - catX;
        mouseDy = mouseSceneY - catY;
        const dist = Math.hypot(mouseDx, mouseDy);
        const hoverRadiusPx = anchor.width * 1.3;
        if (dist < hoverRadiusPx) {
          mouseClose = true;
          hoverIntensity = (hoverRadiusPx - dist) / hoverRadiusPx;
          hoverDwellSec += dt;
          if (
            hoverDwellSec >= VIBRATE_DWELL_S &&
            t - vibrateLastFiredAt > VIBRATE_COOLDOWN_S
          ) {
            vibrateUntilMs = now + VIBRATE_DURATION_S * 1000;
            vibrateLastFiredAt = t;
            hoverDwellSec = 0;
          }
        }
      }
      if (!mouseClose) {
        // Slow decay when mouse leaves so brief excursions don't reset progress.
        hoverDwellSec = Math.max(0, hoverDwellSec - dt * 0.6);
      }
      const vibrating = now < vibrateUntilMs;

      // ── Independent blink algorithm (idle only) ──
      // 90% fast blink (~80-140ms), 10% slow blink (~200-310ms). Random interval
      // 1.8-5.6s. The blink frame is sprite index 0; it's never picked by the
      // shuffle so it only appears under this timer.
      const stateData = data.states[fs.state] ?? data.states.idle!;
      const frames = stateData.frames;
      const mode = stateData.mode ?? 'shuffle';
      if (fs.state === 'idle' && frames.length > 1) {
        if (fs.nextBlinkAtMs === 0) {
          fs.nextBlinkAtMs = now + 1800 + Math.random() * 3800;
        }
        if (!fs.blinking && now >= fs.nextBlinkAtMs) {
          fs.blinking = true;
          const slow = Math.random() < 0.10;
          fs.blinkEndAtMs = now + (slow ? 200 + Math.random() * 110 : 80 + Math.random() * 60);
        } else if (fs.blinking && now >= fs.blinkEndAtMs) {
          fs.blinking = false;
          fs.nextBlinkAtMs = now + 1800 + Math.random() * 3800;
        }
      }

      // ── Shuffle pick (skip index 0 = blink) ──
      const cycleMs = (stateData.ms ?? 1500) * 1.4;
      if (mode === 'shuffle' && frames.length > 2 && now >= fs.nextShuffleAt) {
        fs.shuffleIdx = 1 + Math.floor(Math.random() * (frames.length - 1));
        fs.nextShuffleAt = now + cycleMs;
      } else if (mode === 'loop' && frames.length > 1 && now >= fs.nextShuffleAt) {
        fs.shuffleIdx = ((fs.shuffleIdx) % (frames.length - 1)) + 1;
        fs.nextShuffleAt = now + cycleMs;
      }

      // ── Dizzy multiplier ramp ──
      // Lerp toward target each frame. Slow up, fast down per the design.
      const dizzyTarget = dizzy ? DIZZY_PEAK_MULTIPLIER : 1;
      const dizzyRate = dizzy ? DIZZY_RAMP_UP_RATE : DIZZY_RAMP_DOWN_RATE;
      dizzyMultiplier += (dizzyTarget - dizzyMultiplier) * dizzyRate;

      // ── Resolve which frame to render ──
      let frameIdx: number;
      if (dizzy) {
        // Eye-spin override. Cycle through the 8 look-direction frames at a
        // brisk rate so the eyes appear to rotate clockwise.
        const idx = Math.floor((now - dizzyEnteredAt) / DIZZY_EYE_FRAME_MS) % DIZZY_EYE_CYCLE.length;
        frameIdx = DIZZY_EYE_CYCLE[idx] ?? 1;
      } else if (fs.blinking) {
        frameIdx = 0;                              // eyes closed
      } else if (vibrating) {
        frameIdx = 2;                              // looking up — startled
      } else if (mouseClose && fs.state === 'idle' && frames.length >= 10) {
        frameIdx = lookFrameForDirection(mouseDx, mouseDy);
      } else {
        frameIdx = fs.shuffleIdx;
      }
      // Repaint the shared canvas texture only when the frame index changes —
      // saves a paint per tick when Clat's holding a single look-direction.
      if (frameIdx !== lastFrameIdx) {
        const f = frames[frameIdx] ?? frames[1] ?? frames[0];
        if (f) {
          paintFrame(spriteCtx, f, '#7c3aed', '#000000');
          tex.needsUpdate = true;
        }
        lastFrameIdx = frameIdx;
      }

      // ── Spring drift away from mouse ──
      let targetOffsetX = 0, targetOffsetY = 0;
      if (mouseClose && !vibrating) {
        const mag = Math.hypot(mouseDx, mouseDy) || 1;
        targetOffsetX = -(mouseDx / mag) * hoverIntensity * 0.35;
        targetOffsetY = -(mouseDy / mag) * hoverIntensity * 0.22;
      }
      // During vibration Clat returns to center deliberately, then trembles in place.
      const springRate = vibrating ? 14 : 9;
      hoverVel.x += (targetOffsetX - hoverOffset.x) * springRate * dt;
      hoverVel.y += (targetOffsetY - hoverOffset.y) * springRate * dt;
      hoverVel.x *= 0.86;
      hoverVel.y *= 0.86;
      hoverOffset.x += hoverVel.x * dt;
      hoverOffset.y += hoverVel.y * dt;

      // Vibration jitter: subtle L/R tremor only.
      const purrJitterX = vibrating ? (Math.random() - 0.5) * 0.018 : 0;
      const purrJitterY = 0;

      // ── Cat float + tilt + offset ──
      const tiltZ = (
        Math.sin(t * 0.43) * 0.5 +
        Math.sin(t * 0.79) * 0.3 +
        Math.sin(t * 1.27) * 0.2
      ) * 0.06;
      const yaw = Math.sin(t * 0.31) * 0.06;
      const pitch = -0.04 + Math.sin(t * 0.46) * 0.025;

      // Mouse-bias tilt: when the cursor is inside the hitbox, lean Clat
      // toward it. Yaw responds to horizontal offset, pitch to vertical. The
      // spring keeps the transition smooth, and the targets are zeroed when
      // the cursor leaves, returning to ambient float.
      const targetTiltX = mouseClose ? clamp(-mouseDy / (anchor?.width ?? 1), -1, 1) * 0.18 : 0;
      const targetTiltY = mouseClose ? clamp(mouseDx / (anchor?.width ?? 1), -1, 1) * 0.22 : 0;
      tiltVel.x += (targetTiltX - tiltOffset.x) * 9 * dt;
      tiltVel.y += (targetTiltY - tiltOffset.y) * 9 * dt;
      tiltVel.x *= 0.85;
      tiltVel.y *= 0.85;
      tiltOffset.x += tiltVel.x * dt;
      tiltOffset.y += tiltVel.y * dt;

      catGroup.rotation.z = tiltZ;
      catGroup.rotation.y = yaw + tiltOffset.y;
      catGroup.rotation.x = pitch + tiltOffset.x;
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

        // Angular: clockwise base + per-particle turbulence + dizzy multiplier.
        // dizzyMultiplier is 1 at rest, ramps to DIZZY_PEAK_MULTIPLIER during
        // loading states. Multiplies the angular velocity directly so spin is
        // visibly clockwise faster while dizzy.
        const turbulence = Math.sin(t * 0.8 + pd.zBob[i]! * 1.7) * 0.3;
        pd.theta[i] += (pd.omega[i]! + turbulence * pd.omega[i]!) * dt * dizzyMultiplier;

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

      // ── Data orbs: travel-up arc, drift in a cloud, repel each other ──
      const orbTmp = _orbTmpA;
      // Pass 1: integrate per-orb motion (travel or drift) and flicker.
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
        }
        // Slow per-orb sine flicker — modulates baseOpacity, never reaches zero.
        const flick = 1 - ORB_FLICKER_AMP + ORB_FLICKER_AMP * (0.5 + 0.5 * Math.sin(t * ORB_FLICKER_RATE + orb.flickerPhase));
        orb.mat.opacity = orb.baseOpacity * flick;
      }

      // Pass 2: pairwise repulsion between drift-phase orbs. Tiny stars don't
      // like sharing a pixel — pushes them apart when they crowd.
      for (let i = 0; i < orbs.length; i++) {
        const a = orbs[i]!;
        if (a.phase !== 'drift') continue;
        for (let j = i + 1; j < orbs.length; j++) {
          const b = orbs[j]!;
          if (b.phase !== 'drift') continue;
          const dx = a.pos.x - b.pos.x;
          const dy = a.pos.y - b.pos.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= ORB_REPULSE_RADIUS_PX * ORB_REPULSE_RADIUS_PX) continue;
          const dist = Math.max(1, Math.sqrt(distSq));
          // Force falls off linearly to zero at the repulse radius.
          const falloff = 1 - dist / ORB_REPULSE_RADIUS_PX;
          const f = (ORB_REPULSE_STRENGTH * falloff) / dist;
          const ax = dx * f * dt;
          const ay = dy * f * dt;
          a.vel.x += ax;
          a.vel.y += ay;
          b.vel.x -= ax;
          b.vel.y -= ay;
        }
      }

      // Pass 3: integrate velocity for drift-phase orbs and commit mesh positions.
      for (const orb of orbs) {
        if (orb.phase === 'drift') {
          orb.pos.x += orb.vel.x * dt;
          orb.pos.y += orb.vel.y * dt;
          orb.pos.z += orb.vel.z * dt;
        }
        orb.mesh.position.copy(orb.pos);
      }

      // ── Card rigs: drive stage transitions + tweens ─────
      if (cardScene.drawn) {
        for (const rig of cardRigs) {
          const wanted: CardStage = cardScene.stages[rig.slot] ?? 'face_down';
          if (wanted !== rig.stage) {
            rig.fromPos.copy(rig.group.position);
            rig.fromQuat.copy(rig.group.quaternion);
            rig.toQuat.copy(STAGE_QUAT[wanted]);
            if (wanted === 'lifted') {
              rig.toPos.copy(LIFT_POS);
            } else {
              const xy = SLOT_POS[rig.slot];
              rig.toPos.set(xy[0], SURFACE_Y, xy[1]);
            }
            rig.tweenStart = now;
            rig.tweenDur = STAGE_MS[wanted];
            rig.stage = wanted;
          }
          const u = Math.min(1, (now - rig.tweenStart) / rig.tweenDur);
          const eased = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
          rig.group.position.lerpVectors(rig.fromPos, rig.toPos, eased);
          rig.group.quaternion.copy(rig.fromQuat).slerp(rig.toQuat, eased);
          if (rig.stage === 'lifted' && u >= 1) {
            rig.group.position.y = LIFT_POS.y + Math.sin(t * 1.4) * 0.018;
            const yawDrift = Math.sin(t * 0.7) * 0.05;
            const driftQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawDrift, 0));
            rig.group.quaternion.copy(STAGE_QUAT.lifted).multiply(driftQuat);
          }
        }
        tableGroup.position.y = Math.sin(t * 0.35) * 0.005;
      }

      composer.render();

      // ── Perspective overlay (table + cards) — second-pass render ─
      // Layered on top of the composited ortho output. Scissored to the
      // table-anchor rect so it only fills that region; clearDepth keeps
      // the perspective from being z-occluded by ortho geometry.
      //
      // IMPORTANT: setScissor/setViewport take CSS pixels — three.js
      // multiplies by pixelRatio internally. Don't pre-multiply.
      if (cardScene.drawn) {
        const rect = getTableAnchor();
        if (rect && rect.width >= 2 && rect.height >= 2) {
          const x = Math.round(rect.x);
          const y = Math.round(window.innerHeight - rect.y - rect.height);
          const w = Math.round(rect.width);
          const h = Math.round(rect.height);

          renderer.autoClear = false;
          renderer.setRenderTarget(null);
          renderer.setScissorTest(true);
          renderer.setScissor(x, y, w, h);
          renderer.setViewport(x, y, w, h);
          renderer.clearDepth();

          perspCamera.aspect = rect.width / rect.height;
          perspCamera.updateProjectionMatrix();

          renderer.render(perspScene, perspCamera);

          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
          renderer.autoClear = true;
        }
      }

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
      unsubscribeDizzy();
      unsubscribeReaderMode();
      unsubscribeCardScene();
      unregisterPicker(pickAt);
      for (const orb of orbs) {
        orbGroup.remove(orb.mesh);
        orb.mat.dispose();
      }
      orbs.length = 0;
      orbGeom.dispose();
      catGeom.dispose();
      catMat.dispose();
      tex.dispose();
      eyeGeom.dispose();
      leftEye.mat.dispose();
      rightEye.mat.dispose();
      leftEye.tex.dispose();
      rightEye.tex.dispose();
      cloakGeom.dispose();
      cloakMat.dispose();
      cloakTex.dispose();
      // Perspective layer
      for (const rig of cardRigs) {
        rig.frontMat.dispose();
        rig.backMat.dispose();
      }
      cardGeom.dispose();
      // GLB table meshes
      for (const m of tableMeshes) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat.dispose();
      }
      disposeCardTextures();
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

/**
 * Map a cat→mouse vector to one of the 8 directional look frames of the idle
 * state. Sprite frame indices used:
 *   2 up, 3 down, 4 left, 5 right, 6 up-left, 7 up-right, 8 down-left, 9 down-right
 * Scene coords: +x right, +y up.
 */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lookFrameForDirection(dx: number, dy: number): number {
  // Bias the angle by π/8 so the 8 sectors align to the cardinal/intercardinal directions.
  const a = (Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2);
  const sector = Math.floor(a / (Math.PI / 4));     // 0..7, starting at +x (right) going CCW
  const SECTOR_TO_FRAME = [5, 7, 2, 6, 4, 8, 3, 9]; // right, up-right, up, up-left, left, down-left, down, down-right
  return SECTOR_TO_FRAME[sector] ?? 1;
}

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

/** Paint a robed / cloaked silhouette behind the eyes. The shape is a
 *  peaked hood at the top of the canvas that flares OUT into wide
 *  shoulders as it descends, then continues straight down off the
 *  bottom of the canvas. Pure void-black fill — the cloak is a hole in
 *  the starfield, not a tinted shape. */
function paintCloak(ctx: CanvasRenderingContext2D): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Cloak silhouette — narrow hood up top, flares wide as it falls,
  // continues off the bottom edge.
  const path = new Path2D();
  // Peak (top of hood) — narrow
  path.moveTo(W * 0.50, H * 0.04);
  // Right side of hood, curving down
  path.bezierCurveTo(
    W * 0.66, H * 0.06,
    W * 0.78, H * 0.16,
    W * 0.82, H * 0.30,
  );
  // Right shoulder — flares OUT as it descends
  path.bezierCurveTo(
    W * 0.95, H * 0.42,
    W * 1.05, H * 0.62,
    W * 1.05, H * 0.92,
  );
  // Bottom right corner (off-canvas)
  path.lineTo(W * 1.05, H * 1.05);
  // Bottom left corner (off-canvas)
  path.lineTo(W * -0.05, H * 1.05);
  // Left shoulder flaring back up
  path.lineTo(W * -0.05, H * 0.92);
  path.bezierCurveTo(
    W * -0.05, H * 0.62,
    W * 0.05, H * 0.42,
    W * 0.18, H * 0.30,
  );
  // Left side of hood back to peak
  path.bezierCurveTo(
    W * 0.22, H * 0.16,
    W * 0.34, H * 0.06,
    W * 0.50, H * 0.04,
  );
  path.closePath();

  // Pure void black fill — no rim. The cloak is a hole in the starfield.
  ctx.fillStyle = '#000000';
  ctx.fill(path);
}
