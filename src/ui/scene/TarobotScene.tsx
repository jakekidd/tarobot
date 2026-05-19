import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAnchor } from './anchorStore';
import { subscribeImpacts, type Impact as ImpactEvent } from './impactStore';
import { createOrbitingCards } from './orbitingCards';
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
import { createMascot, resolveMascotId, type Mascot } from './mascots';
import { loadSettings } from '../../storage';
import { subscribeDebugVisible } from '../../debug/visibilityStorage';
import { publishDebug, clearDebug } from '../../debug/debugBus';
import { flip as playFlipSfx } from '../sound/sound';
import { subscribeFlyIn, endFlyIn, type FlyInState } from './flyInStore';

// Time-based intro: when the page first loads the mascot zooms in from
// a tiny dot to full scale. Once-per-session (the scene only mounts
// once at app boot).
const ZOOM_IN_DURATION_MS = 1100;
const ZOOM_IN_START_SCALE = 0.12;

// Bumped 130 → 280 so the cloak silhouette (pure-black-on-pure-black)
// has enough surrounding starfield to read as a shape by occlusion.
// Without enough stars covering the cloak's body area, the silhouette
// disappears against the void.
const PARTICLE_COUNT = 280;
const PARTICLE_BURST_DURATION = 0.6;     // seconds; initial outward burst
// -0.012 ≈ 2× prior baseline. Particles already get a 10× boost via
// dizzyMultiplier when awaiting_tier is set (Reading.tsx wires it in),
// so the "accelerate while waiting" behavior comes free on top.
const PARTICLE_BASE_OMEGA = -0.012;

// "Dizzy" state — fires while a blocking LLM call is in flight. Dust
// ramps to ~10× baseline omega clockwise, holds, then brakes fast when
// dizzy releases. The mascot is passed `dizzy` via context and may
// react however it wants (the cat spins her eyes; turtle ignores).
const DIZZY_PEAK_MULTIPLIER = 10;
const DIZZY_RAMP_UP_RATE = 0.05;          // per-frame lerp toward peak (slow start)
const DIZZY_RAMP_DOWN_RATE = 0.25;        // per-frame lerp toward baseline (fast brake)
const PARTICLE_MIN_RADIUS = 0.55;         // in mascot-widths
// Bumped 1.6 → 3.2 so the swirl extends down past the eyes over the
// cloak body — gives stars to occlude where there were none before.
const PARTICLE_MAX_RADIUS = 3.2;
const PARTICLE_SIZE_PX = 1.5;             // ~1/4 the prior visual size
const PARTICLE_BURST_VEL = 0.19;          // initial outward velocity (~1/8 of prior burst)
const PARTICLE_BURST_VEL_JITTER = 0.19;

// (Data-orbs system removed — replaced by orbiting cards. See
// ./orbitingCards.ts. Each answer spawns a flat gold/silver card that
// orbits the turtle behind the visible plane and fades out as it
// approaches the front of the orbit.)

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
 *   - Reads ReaderAnchor's bbox each frame and places the cat there.
 *   - Particles are camera-facing squares that burst-out on mount, then
 *     swirl clockwise around the cat with per-particle randomness.
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

    // World-space lights — only the turtle mascot uses a lit material;
    // every other mesh in the scene is MeshBasicMaterial and ignores
    // these. Placed in world coords (not parented to the scaled mascot
    // rig) so the lighting direction is stable across viewport sizes.
    //
    // Hemi gives a soft sky/ground ambient that touches every normal.
    // Key sits in front of and above the camera plane, so faces that
    // point AT the camera (where the turtle's shell-back ends up after
    // the X-tilt) get lit, not just upward-facing faces.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2d5a, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(0, 200, 800);   // mostly toward camera, slight overhead
    scene.add(keyLight);                    // target defaults to (0,0,0)

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

    // (Mascot mesh + texture + sprite logic now lives in
    //  ./mascots/<id>.ts and is constructed below.)

    // ─── Eyes (alternative face — the seer) ──────────────
    // Two flat planes textured by a per-eye canvas, plus a dark
    // cloak/hood silhouette plane behind them. The hood is what gives
    // the seer a shape beyond two floating spheres.
    const eyesGroup = new THREE.Group();
    const EYE_W = 0.36;
    const EYE_H = 0.27;
    const EYE_SEP = 0.62;
    const eyeGeom = new THREE.PlaneGeometry(EYE_W, EYE_H);

    // ── Cowl (3D mesh, sits behind the eyes) ───────────────
    // Real hooded-cowl GLTF (Sketchfab "Accessory_Hood Cowl 001" by
    // collinsweeney, CC-BY-4.0 — credit in /public/cowl/license.txt).
    // Textures stripped (see /tmp/strip_textures.py); we override the
    // material to pure-black silhouette so the cowl reads as a hole in
    // the starfield rather than a tinted shape.
    //
    // Sketchfab's typical orientation puts hood-opening on +z, so an
    // ortho camera looking down -z sees into the hood — exactly what we
    // want (eyes appear floating inside the hood opening).
    const cowlGroup = new THREE.Group();
    // Bumped 4.0 → 5.5 (thicker silhouette, more presence).
    cowlGroup.scale.setScalar(5.5);
    // z=-1.2 pushes the cowl BEHIND the eyes (at z=0) so the eyes
    // float in front of the hood opening rather than being obscured.
    cowlGroup.position.set(0, -0.4, -1.2);
    eyesGroup.add(cowlGroup);

    const cowlMaterials: THREE.Material[] = [];
    const cowlGeometries: THREE.BufferGeometry[] = [];
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      '/cowl/scene.gltf',
      (gltf) => {
        const model = gltf.scene;
        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            // Keep the gltf's natural baseColor texture, but darken +
            // make 60% opaque. The bloom pass has threshold 0.30, so
            // the gold accents at native ~0.79 luminance blow out.
            // 0x707070 color multiplier × 0.6 opacity puts effective
            // luminance ≈ 0.21 — below threshold, no bloom blow-up.
            const orig = obj.material as THREE.MeshStandardMaterial | undefined;
            const origMap = orig?.map ?? null;
            const mat = new THREE.MeshBasicMaterial({
              map: origMap,
              color: 0x707070,
              transparent: true,
              opacity: 0.6,
              depthWrite: false,
            });
            cowlMaterials.push(mat);
            cowlGeometries.push(obj.geometry);
            obj.material = mat;
          }
        });
        // Center the model around its own bbox so cowlGroup's position
        // controls the cowl's center, not the model's arbitrary origin.
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        cowlGroup.add(model);
      },
      undefined,
      (err) => {
        console.error('[tarobot] failed to load cowl gltf', err);
      },
    );

    // ── DEBUG: red wireframe box around the cowl group ──
    // Bounds the cowlGroup at its current scale; helps judge alignment.
    const seerOutlineGeom = new THREE.BoxGeometry(1.0, 1.0, 0.6);
    const seerOutlineEdges = new THREE.EdgesGeometry(seerOutlineGeom);
    const seerOutlineMat = new THREE.LineBasicMaterial({
      color: 0xff0000,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const seerOutline = new THREE.LineSegments(seerOutlineEdges, seerOutlineMat);
    seerOutline.position.copy(cowlGroup.position);
    seerOutline.scale.copy(cowlGroup.scale);
    seerOutline.renderOrder = 999;
    seerOutline.visible = false;
    eyesGroup.add(seerOutline);

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
      gaze: { x: number; y: number },  // -1..1 within the table area; (0,0) = idle drift
    ) {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const rx = W * 0.46;
      const ry = H * 0.46;

      // Eye orb — solid brand violet (the hard-step "whites of the
      // eyes" pass looked off against the cowl behind it, per user).
      ctx.fillStyle = 'rgba(124, 58, 237, 1.0)';
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
        // When `gaze` is non-zero (mouse over the table), bias the
        // pupil toward the mouse with a smooth blend against the
        // drift — eyes tracking the cursor.
        const pupilR = Math.min(rx, ry) * 0.34;
        const wanderX = rx * 0.45;        // big reach so gaze is obvious
        const wanderY = ry * 0.42;
        const driftX = (
          Math.sin(timeSec * 0.31 + jitter * 6.28) * 0.65 +
          Math.sin(timeSec * 0.83 + jitter * 3.14) * 0.35
        ) * wanderX;
        const driftY = (
          Math.cos(timeSec * 0.27 + jitter * 6.28) * 0.65 +
          Math.cos(timeSec * 0.71 + jitter * 1.57) * 0.35
        ) * wanderY;
        const gazeMag = Math.min(1, Math.hypot(gaze.x, gaze.y));
        const blend = Math.min(1, gazeMag * 1.4);
        const targetX = gaze.x * wanderX;
        const targetY = gaze.y * wanderY;
        const offsetX = driftX * (1 - blend) + targetX * blend;
        const offsetY = driftY * (1 - blend) + targetY * blend;
        ctx.fillStyle = 'rgba(12, 4, 28, 0.95)';
        ctx.beginPath();
        ctx.ellipse(cx + offsetX, cy + offsetY, pupilR, pupilR, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const particleGroup = new THREE.Group();

    // ── Mascot (the survey-side figure) ───────────────────
    // Selected once at scene mount. Resolution order:
    //   ?mascot=<id> URL param  →  localStorage Settings.mascotId
    //   →  DEFAULT_MASCOT_ID (currently 'turtle').
    // The scene treats this as an opaque Mascot; it doesn't know
    // which one is running. See ./mascots/index.ts.
    const mascotId = resolveMascotId(loadSettings().mascotId);
    const mascot: Mascot = createMascot(mascotId);

    const positionGroup = new THREE.Group();
    positionGroup.add(mascot.group);
    positionGroup.add(eyesGroup);
    positionGroup.add(particleGroup);
    scene.add(positionGroup);

    // Reader mode subscription — flips which face is shown at the anchor.
    // (The old cat→eyes "shatter" transition is deferred — it lived
    // here because it used the cat's sprite texture; will be re-added as
    // a Mascot lifecycle hook when another mascot also wants a custom
    // transition. See TODO.md → "mascot exit animation hook".)
    let readerMode: ReaderMode = 'cat';
    const unsubscribeReaderMode = subscribeReaderMode((m) => {
      readerMode = m;
    });

    // Eyes blink state — independent of the cat's sprite-frame blink, since
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

    // ─── Orbiting cards (answer counter) ──────────────────
    // Each answer/pass fires a flat card that orbits the turtle on a
    // horizontal plane behind the camera-facing side. Self-contained in
    // ./orbitingCards.ts; we forward impact events into it.
    const orbitingCards = createOrbitingCards({
      scene,
      getAnchor,
      getViewport: () => ({ w: viewportW, h: viewportH }),
    });

    const unsubscribeImpacts = subscribeImpacts((evt: ImpactEvent) => {
      orbitingCards.spawnCard(!!evt.passed, evt.x, evt.y);
    });

    // ─── Perspective layer (table + cards) ───────────────
    // Lives in the SAME canvas as the ortho scene above. Rendered to the
    // table-anchor rect (scissored sub-viewport). When no anchor is set
    // (menu / survey), the perspective render is skipped entirely.

    const perspScene = new THREE.Scene();
    // Bumped far plane 80 → 200 so the fly-in start position (z≈120)
    // still has the table in view as a tiny speck.
    const perspCamera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
    // Seated POV — lookAt sits above the tabletop so the table reads
    // in the lower portion of the canvas. Small pull-back from the
    // previous "too close" pass.
    const NORMAL_CAM_POS = new THREE.Vector3(0, 4.6, 7.4);
    const FLY_START_POS = new THREE.Vector3(0, 4.6, 120);
    const CAM_LOOKAT = new THREE.Vector3(0, 1.0, 0);
    perspCamera.position.copy(NORMAL_CAM_POS);
    perspCamera.lookAt(CAM_LOOKAT);

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
    // Lifted card position — calibrated from the debug reference card.
    // User positioned the red wireframe at (0, 1.00, 1.00) and asked
    // for the held card to move there. z=1.0 → ~6.4 units in front of
    // the camera; y=1.0 puts the card slightly above the table center.
    const LIFT_POS = new THREE.Vector3(0, 1.0, 1.0);
    const STAGE_QUAT: Record<CardStage, THREE.Quaternion> = {
      face_down: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      face_up:   new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
      lifted:    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0, 0)),
    };
    const STAGE_MS: Record<CardStage, number> = {
      face_down: 700, face_up: 700, lifted: 950,   // lift gets longer to read the arc
    };

    const cardGeom = new THREE.PlaneGeometry(CARD_W, CARD_H);

    // ── DEBUG: red wireframe reference card ──────────
    // A movable wireframe outline (CARD_W × CARD_H × CARD_THICK) the
    // user can position with arrow keys to pin down the *exact* xyz
    // they want a real card to occupy. Starts at LIFT_POS so the
    // first nudge is relative to where the lifted card currently sits.
    const refCardGeom = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_THICK);
    const refCardEdges = new THREE.EdgesGeometry(refCardGeom);
    const refCardMat = new THREE.LineBasicMaterial({
      color: 0xff0000,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const refCard = new THREE.LineSegments(refCardEdges, refCardMat);
    refCard.position.copy(LIFT_POS);
    refCard.quaternion.copy(STAGE_QUAT.lifted);
    refCard.renderOrder = 999;
    refCard.visible = false;
    perspScene.add(refCard);

    // Arrow keys move the reference card. Up/Down → world y (toward
    // the warm key light overhead or down toward the table). Left/Right
    // → world z (camera at +z, so Right = +z toward viewer, Left = -z
    // away from viewer). Step size in world units per keypress; hold
    // Shift for a finer step.
    function onKeyDown(e: KeyboardEvent) {
      if (!refCard.visible) return;
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      }
      const step = e.shiftKey ? 0.05 : 0.2;
      let handled = true;
      switch (e.key) {
        case 'ArrowUp':    refCard.position.y += step; break;
        case 'ArrowDown':  refCard.position.y -= step; break;
        case 'ArrowRight': refCard.position.z += step; break;
        case 'ArrowLeft':  refCard.position.z -= step; break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown);

    // Debug visibility wiring — toggle both overlays at once.
    const unsubscribeDebug = subscribeDebugVisible((on) => {
      seerOutline.visible = on;
      refCard.visible = on;
      if (!on) {
        clearDebug('card.lift');
        clearDebug('card.ref');
      }
    });

    // Fly-in subscription — Reading triggers via startFlyIn(); the
    // animate loop reads `flyIn` each frame and lerps perspCamera.
    let flyIn: FlyInState = { active: false, startTime: 0, durationMs: 3500 };
    const unsubscribeFlyIn = subscribeFlyIn((s) => { flyIn = s; });

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
      // Hover glow: a flat additive cyan disc on the table beneath
      // each pickable face-down card. Brightens + scales up when the
      // mouse is over THIS card. Lerps each frame for smoothness.
      glowMesh: THREE.Mesh;
      glowMat: THREE.MeshBasicMaterial;
      hovered: boolean;
      hoverAmt: number;
    };

    // Glow disc texture — cyan radial gradient on transparent.
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0.00, 'rgba(34, 211, 238, 0.95)');
      grad.addColorStop(0.30, 'rgba(34, 211, 238, 0.55)');
      grad.addColorStop(0.70, 'rgba(34, 211, 238, 0.15)');
      grad.addColorStop(1.00, 'rgba(34, 211, 238, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    })();
    const glowGeom = new THREE.PlaneGeometry(CARD_W * 1.8, CARD_H * 1.4);

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
      // Glow lives at the slot in world coords (not as a child of the
      // rig group) so it stays put on the table even if the card lifts.
      const glowMat = new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const glowMesh = new THREE.Mesh(glowGeom, glowMat);
      glowMesh.rotation.x = -Math.PI / 2;       // flat on the table
      glowMesh.position.set(xy[0], SURFACE_Y - 0.005, xy[1]);
      glowMesh.visible = false;
      perspScene.add(glowMesh);
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
        glowMesh, glowMat,
        hovered: false,
        hoverAmt: 0,
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
          for (const rig of cardRigs) {
            rig.group.visible = false;
            rig.glowMesh.visible = false;
            rig.glowMat.opacity = 0;
            rig.hoverAmt = 0;
          }
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

    // ─── Mouse position tracking ──────────────────────────
    // We track the mouse in scene coords and pass {dx, dy, close,
    // intensity} to the mascot per frame. The mascot decides whether
    // and how to react (the cat: drift away + dwell-vibrate; turtle: ignore).
    let mouseSceneX = 999;             // viewport-pixel coords, center-origin
    let mouseSceneY = 999;

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
    // Subscribed to dizzyStore (fires while a blocking LLM call is in
    // flight). The mascot reads `dizzy` via context and reacts however
    // it wants (the cat spins her eyes; turtle ignores). Particles ramp
    // their clockwise omega up using dizzyMultiplier.
    let dizzy = false;
    let dizzyMultiplier = 1;
    const unsubscribeDizzy = subscribeDizzy((v) => {
      dizzy = v;
    });

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
      mascot.group.visible = readerMode === 'cat';
      eyesGroup.visible = readerMode === 'eyes';

      // (Legacy the cat explosion-chunk loop removed with cat extraction.
      //  Lived here; replaced when Mascot exit-hook lands. See TODO.md.)

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
        // Gaze: eyes track the mouse over the table region whenever
        // the seer is shown (not just during pickable). NDC (-1..1)
        // within the table-anchor rect; idle drift takes over outside.
        const gaze = { x: 0, y: 0 };
        if (mouseSceneX < 998) {
          const tr = getTableAnchor();
          if (tr && tr.width > 0 && tr.height > 0) {
            const screenX = mouseSceneX + viewportW / 2;
            const screenY = viewportH / 2 - mouseSceneY;
            const u = (screenX - tr.x) / tr.width;
            const v = (screenY - tr.y) / tr.height;
            if (u >= -0.3 && u <= 1.3 && v >= -0.3 && v <= 1.3) {
              gaze.x = Math.max(-1, Math.min(1, (u - 0.5) * 2));
              gaze.y = Math.max(-1, Math.min(1, (v - 0.5) * 2));
            }
          }
        }
        paintEye(leftEye.ctx, t, mood, 0.0, gaze);
        paintEye(rightEye.ctx, t, mood, 0.37, gaze);
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

      // ── Mouse hitbox → mascot context ─────────────────────
      // The scene only TRACKS the mouse and computes a generic
      // (dx, dy, close, intensity). The mascot decides what to do
      // with that (drift, tilt, vibrate, ignore). Hitbox radius
      // scales with anchor.width like the cat's used to.
      let mouseClose = false;
      let mouseDx = 0, mouseDy = 0;
      let hoverIntensity = 0;
      if (anchor && mouseSceneX < 998) {
        const cx = anchor.x - viewportW / 2;
        const cy = viewportH / 2 - anchor.y;
        mouseDx = mouseSceneX - cx;
        mouseDy = mouseSceneY - cy;
        const dist = Math.hypot(mouseDx, mouseDy);
        const hoverRadiusPx = anchor.width * 1.3;
        if (dist < hoverRadiusPx) {
          mouseClose = true;
          hoverIntensity = (hoverRadiusPx - dist) / hoverRadiusPx;
        }
      }

      mascot.update({
        dt, t,
        mouse: { dx: mouseDx, dy: mouseDy, close: mouseClose, intensity: hoverIntensity },
        dizzy,
      });

      // ── Dizzy multiplier ramp (for particles) ─────────────
      // Lerp toward target each frame. Slow up, fast down per the design.
      const dizzyTarget = dizzy ? DIZZY_PEAK_MULTIPLIER : 1;
      const dizzyRate = dizzy ? DIZZY_RAMP_UP_RATE : DIZZY_RAMP_DOWN_RATE;
      dizzyMultiplier += (dizzyTarget - dizzyMultiplier) * dizzyRate;

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

      // ── Orbiting cards: physics-based answer counter ──
      orbitingCards.update(dt);

      // ── Card hover: raycast against face-down pickable cards ──
      let hoveredSlot: SlotName | null = null;
      if (cardScene.pickable && mouseSceneX < 998 && cardScene.drawn) {
        const tr = getTableAnchor();
        if (tr && tr.width > 0 && tr.height > 0) {
          const screenX = mouseSceneX + viewportW / 2;
          const screenY = viewportH / 2 - mouseSceneY;
          if (screenX >= tr.x && screenX <= tr.x + tr.width && screenY >= tr.y && screenY <= tr.y + tr.height) {
            const ndcX = ((screenX - tr.x) / tr.width) * 2 - 1;
            const ndcY = -((screenY - tr.y) / tr.height) * 2 + 1;
            perspCamera.aspect = tr.width / tr.height;
            perspCamera.updateProjectionMatrix();
            raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), perspCamera);
            const targets: THREE.Object3D[] = [];
            for (const rig of cardRigs) {
              if (rig.stage !== 'face_down' || !rig.group.visible) continue;
              targets.push(rig.frontMesh, rig.backMesh);
            }
            const hits = raycaster.intersectObjects(targets, false);
            for (const h of hits) {
              const slot = h.object.userData.slot as SlotName | undefined;
              if (slot) { hoveredSlot = slot; break; }
            }
          }
        }
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
            // Whoosh on face-up reveal — single SFX per flip, fires
            // the moment a stage transition into face_up begins.
            if (wanted === 'face_up' && rig.stage !== 'face_up') {
              playFlipSfx();
            }
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
          // Hover glow + tiny lift while pickable. Glow opacity rests at
          // ~0.25 for any pickable face_down card; ramps to ~0.85 when
          // the mouse is over THIS specific card. Glow always visible
          // when card is face-down and pickable; faded out otherwise.
          rig.hovered = hoveredSlot === rig.slot;
          const showGlow = cardScene.pickable && rig.stage === 'face_down';
          const targetGlow = showGlow ? (rig.hovered ? 0.85 : 0.25) : 0;
          rig.hoverAmt += ((rig.hovered && showGlow ? 1 : 0) - rig.hoverAmt) * 0.18;
          rig.glowMat.opacity += (targetGlow - rig.glowMat.opacity) * 0.18;
          rig.glowMesh.visible = rig.glowMat.opacity > 0.01;
          const glowScale = 1 + rig.hoverAmt * 0.35;
          rig.glowMesh.scale.set(glowScale, glowScale, 1);
          // Tiny hair-lift on the hovered face-down card.
          if (rig.stage === 'face_down') {
            rig.group.position.y = SURFACE_Y + rig.hoverAmt * 0.045;
          }
        }
        tableGroup.position.y = Math.sin(t * 0.35) * 0.005;
      }

      // ── DEBUG: publish lifted card + reference card xyz ──
      // When no card is currently in the 'lifted' stage, fall back to the
      // LIFT_POS target — gives the user a stable reference even between
      // flips so they can compare against the movable ref card.
      if (refCard.visible) {
        const lifted = cardRigs.find((r) => r.stage === 'lifted');
        publishDebug('card.lift', fmtXYZ(lifted ? lifted.group.position : LIFT_POS));
        publishDebug('card.ref', fmtXYZ(refCard.position));
      }

      composer.render();

      // ── Perspective overlay (table + cards) — second-pass render ─
      // Layered on top of the composited ortho output. Scissored to the
      // table-anchor rect so it only fills that region; clearDepth keeps
      // the perspective from being z-occluded by ortho geometry.
      //
      // IMPORTANT: setScissor/setViewport take CSS pixels — three.js
      // multiplies by pixelRatio internally. Don't pre-multiply.
      // ── Fly-in: override the perspective camera position while a
      // fly-in animation is active. Camera lerps from FLY_START_POS
      // (far back, table appears as a tiny speck — "light at the end
      // of the tunnel") to NORMAL_CAM_POS over flyIn.durationMs. We
      // call endFlyIn() locally when the lerp completes so Reading can
      // hand off to the engine intro.
      if (flyIn.active) {
        const u = Math.min(1, (now - flyIn.startTime) / flyIn.durationMs);
        // Heavy ease-out: slow approach until the last beat, then a
        // last-second "woosh" inward as we settle on the normal POV.
        const eased = 1 - Math.pow(1 - u, 4);
        perspCamera.position.lerpVectors(FLY_START_POS, NORMAL_CAM_POS, eased);
        perspCamera.lookAt(CAM_LOOKAT);
        if (u >= 1) endFlyIn();
      }

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
      unsubscribeDebug();
      unsubscribeFlyIn();
      window.removeEventListener('keydown', onKeyDown);
      clearDebug('card.lift');
      clearDebug('card.ref');
      unregisterPicker(pickAt);
      mascot.dispose();
      orbitingCards.dispose();
      eyeGeom.dispose();
      leftEye.mat.dispose();
      rightEye.mat.dispose();
      leftEye.tex.dispose();
      rightEye.tex.dispose();
      for (const m of cowlMaterials) m.dispose();
      for (const g of cowlGeometries) g.dispose();
      seerOutlineGeom.dispose();
      seerOutlineEdges.dispose();
      seerOutlineMat.dispose();
      refCardGeom.dispose();
      refCardEdges.dispose();
      refCardMat.dispose();
      // Perspective layer
      for (const rig of cardRigs) {
        rig.frontMat.dispose();
        rig.backMat.dispose();
        rig.glowMat.dispose();
      }
      cardGeom.dispose();
      glowGeom.dispose();
      glowTex.dispose();
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
function fmtXYZ(v: THREE.Vector3): string {
  return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
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

