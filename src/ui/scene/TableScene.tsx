// 3D reading table — perspective scene with a procedural cloth-draped
// table and four tarot cards laid in a diamond. Mounted only during the
// reading phase. Self-contained: own renderer, own animate loop, own
// raycaster for slot clicks.
//
// Card stages per slot:
//   face_down → flat on table, back up
//   face_up   → flat on table, front up
//   lifted    → raised close to camera, facing the viewer
//
// Transitions tween position + orientation (slerp) over per-stage
// durations. The flip itself slerps from face_down to face_up; the lift
// is a second tween that fires once face_up is reached.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { DrawnCards } from '../../pipeline';
import { cardBackTexture, cardFaceTexture } from '../cards/cardTexture';

export type SlotName = 'top' | 'left' | 'right' | 'bottom';
export type CardStage = 'face_down' | 'face_up' | 'lifted';

type Props = {
  drawn: DrawnCards;
  /** Per-slot target stage. Undefined slot is treated as face_down. */
  stages: Partial<Record<SlotName, CardStage>>;
  /** When true, face-down cards are clickable; the canvas highlights them. */
  pickable: boolean;
  /** Fires on raycast click of a face-down card while pickable. */
  onPick: (slot: SlotName) => void;
  /** Width / height of the canvas in CSS pixels. */
  width: number;
  height: number;
};

// ── Layout constants ─────────────────────────────────────────
const CARD_W = 0.84;
const CARD_H = 1.26;
const CARD_THICKNESS = 0.01;        // tiny gap between front + back planes

const TABLE_TOP_RADIUS = 2.55;
const TABLE_TOP_THICKNESS = 0.12;
const TABLE_TOP_Y = 0;              // centre of the top slab
const TABLE_SKIRT_HEIGHT = 1.45;

// Where each slot sits on the table surface (y = tabletop top).
const SLOT_POS: Record<SlotName, [number, number]> = {
  top:    [0, -1.05],
  left:   [-1.25, 0],
  right:  [1.25, 0],
  bottom: [0, 1.05],
};

const TABLE_SURFACE_Y = TABLE_TOP_Y + TABLE_TOP_THICKNESS / 2;
const CARD_REST_Y = TABLE_SURFACE_Y + 0.012;     // small lift above the wood
const LIFT_POS = new THREE.Vector3(0, 1.55, 2.05);

// Eulers for each stage, applied via quaternion slerp
const STAGE_QUAT: Record<CardStage, THREE.Quaternion> = {
  face_down: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
  face_up:   new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
  // Slightly tilted back toward camera; small yaw drift gets added in the
  // animate loop for a hand-held feel.
  lifted:    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0)),
};

// Tween durations (ms) — picked by destination stage
const DURATION_BY_STAGE: Record<CardStage, number> = {
  face_down: 600,
  face_up:   900,
  lifted:    700,
};

export function TableScene({
  drawn, stages, pickable, onPick, width, height,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Live props — animate loop reads from this ref so we don't tear down the
  // scene every render.
  const propsRef = useRef({ drawn, stages, pickable, onPick });

  useEffect(() => {
    propsRef.current = { drawn, stages, pickable, onPick };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 50);
    // Seated POV — camera slightly above and behind the table, looking
    // down at the centre. Pulled back a touch to keep the lifted card from
    // crowding the frame.
    camera.position.set(0, 1.85, 3.55);
    camera.lookAt(0, TABLE_SURFACE_Y, 0.1);

    // ── Lighting ────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x2a1a55, 1.2));
    const key = new THREE.DirectionalLight(0xefe1ff, 1.2);
    key.position.set(1.2, 4.5, 2.4);
    scene.add(key);
    // Subtle warm rim from below-front to light the cloth drape
    const rim = new THREE.PointLight(0xb27cff, 0.7, 6, 1.6);
    rim.position.set(0, 0.4, 2.8);
    scene.add(rim);

    // ── Table ───────────────────────────────────────────────
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    // Top — dark plum wood
    const topGeom = new THREE.CylinderGeometry(
      TABLE_TOP_RADIUS, TABLE_TOP_RADIUS, TABLE_TOP_THICKNESS, 80,
    );
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x1a0e30,
      roughness: 0.55,
      metalness: 0.0,
    });
    const top = new THREE.Mesh(topGeom, topMat);
    top.position.y = TABLE_TOP_Y;
    tableGroup.add(top);

    // Skirt — cloth drape, flared outward at the bottom
    const skirtGeom = new THREE.CylinderGeometry(
      TABLE_TOP_RADIUS,       // top
      TABLE_TOP_RADIUS + 0.42, // bottom (flared)
      TABLE_SKIRT_HEIGHT,
      80, 1, true,             // open-ended
    );
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x261344,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const skirt = new THREE.Mesh(skirtGeom, skirtMat);
    skirt.position.y = TABLE_TOP_Y - TABLE_TOP_THICKNESS / 2 - TABLE_SKIRT_HEIGHT / 2;
    tableGroup.add(skirt);

    // Apply a low-frequency radial wobble to the skirt vertices so the cloth
    // reads as draped fabric rather than a tube. Permutates the X/Z of each
    // ring proportionally to its Y position (more wobble lower down).
    const skirtPos = skirtGeom.attributes.position;
    if (skirtPos) {
      const arr = skirtPos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i + 0]!;
        const y = arr[i + 1]!;
        const z = arr[i + 2]!;
        const angle = Math.atan2(z, x);
        const radial = Math.hypot(x, z);
        // 8 lobes of gentle inward/outward modulation, scaled by how far
        // we are below the top edge.
        const heightFactor = (TABLE_SKIRT_HEIGHT / 2 - y) / TABLE_SKIRT_HEIGHT;
        const wob = Math.sin(angle * 8) * 0.06 * heightFactor +
                    Math.sin(angle * 17 + 1.3) * 0.025 * heightFactor;
        const r2 = radial + wob;
        arr[i + 0] = Math.cos(angle) * r2;
        arr[i + 2] = Math.sin(angle) * r2;
      }
      skirtPos.needsUpdate = true;
      skirtGeom.computeVertexNormals();
    }

    // ── Cards ───────────────────────────────────────────────
    // Each card is a group with two thin meshes back-to-back (front +
    // back). The group's quaternion is the only thing we animate.
    const cardGeom = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const backTex = cardBackTexture();

    type CardRig = {
      slot: SlotName;
      group: THREE.Group;
      frontMat: THREE.MeshBasicMaterial;
      backMat: THREE.MeshBasicMaterial;
      stage: CardStage;
      // tween state
      tweenStart: number;
      tweenDuration: number;
      fromPos: THREE.Vector3;
      fromQuat: THREE.Quaternion;
      toPos: THREE.Vector3;
      toQuat: THREE.Quaternion;
    };

    const cardRigs: CardRig[] = [];
    const pickableMeshes: THREE.Mesh[] = [];

    for (const dc of drawn.cards) {
      const slot = dc.position.id as SlotName;
      const faceTex = cardFaceTexture(dc.card);
      const frontMat = new THREE.MeshBasicMaterial({ map: faceTex });
      const backMat = new THREE.MeshBasicMaterial({ map: backTex });
      const front = new THREE.Mesh(cardGeom, frontMat);
      const back = new THREE.Mesh(cardGeom, backMat);
      // Back faces the opposite direction
      back.rotation.y = Math.PI;
      // Push each slightly apart so they don't z-fight when seen edge-on
      front.position.z = CARD_THICKNESS / 2;
      back.position.z = -CARD_THICKNESS / 2;

      const group = new THREE.Group();
      group.add(front);
      group.add(back);

      // Initial rest: face-down on table
      const slotXY = SLOT_POS[slot];
      group.position.set(slotXY[0], CARD_REST_Y, slotXY[1]);
      group.quaternion.copy(STAGE_QUAT.face_down);
      scene.add(group);

      const rig: CardRig = {
        slot,
        group,
        frontMat,
        backMat,
        stage: 'face_down',
        tweenStart: 0,
        tweenDuration: 1,
        fromPos: group.position.clone(),
        fromQuat: group.quaternion.clone(),
        toPos: group.position.clone(),
        toQuat: group.quaternion.clone(),
      };
      cardRigs.push(rig);
      pickableMeshes.push(front);
      pickableMeshes.push(back);
      // Tag each mesh with its slot for raycast lookup
      front.userData.slot = slot;
      back.userData.slot = slot;
    }

    // ── Bloom ───────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.42,   // strength — subtle, this scene isn't sprite-glow heavy
      0.7,
      0.35,
    ));
    composer.addPass(new OutputPass());

    // ── Picking ─────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pickAt(clientX: number, clientY: number): SlotName | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickableMeshes, false);
      for (const h of hits) {
        const slot = h.object.userData.slot as SlotName | undefined;
        if (slot) return slot;
      }
      return null;
    }

    function onPointerDown(e: PointerEvent) {
      if (!propsRef.current.pickable) return;
      const slot = pickAt(e.clientX, e.clientY);
      if (!slot) return;
      const rig = cardRigs.find((r) => r.slot === slot);
      // Only face-down cards are pickable
      if (!rig || rig.stage !== 'face_down') return;
      propsRef.current.onPick(slot);
    }

    function onPointerMove(e: PointerEvent) {
      // Update cursor style — pointer over a face-down pickable card.
      if (!propsRef.current.pickable) {
        renderer.domElement.style.cursor = 'default';
        return;
      }
      const slot = pickAt(e.clientX, e.clientY);
      const hovering = !!slot && cardRigs.find((r) => r.slot === slot)?.stage === 'face_down';
      renderer.domElement.style.cursor = hovering ? 'pointer' : 'default';
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // ── Stage-change driver ────────────────────────────────
    // Each tick, compare each rig's current stage to props. If different,
    // snapshot current transform as the tween start and set the new target.
    function syncStages(now: number): void {
      const stages = propsRef.current.stages;
      for (const rig of cardRigs) {
        const wanted: CardStage = stages[rig.slot] ?? 'face_down';
        if (wanted === rig.stage) continue;
        rig.fromPos.copy(rig.group.position);
        rig.fromQuat.copy(rig.group.quaternion);
        rig.toQuat.copy(STAGE_QUAT[wanted]);
        if (wanted === 'lifted') {
          rig.toPos.copy(LIFT_POS);
        } else {
          const slotXY = SLOT_POS[rig.slot];
          rig.toPos.set(slotXY[0], CARD_REST_Y, slotXY[1]);
        }
        rig.tweenStart = now;
        rig.tweenDuration = DURATION_BY_STAGE[wanted];
        rig.stage = wanted;
      }
    }

    function easeInOutCubic(t: number): number {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    let rafId = 0;
    let mounted = true;
    let paused = document.visibilityState !== 'visible';
    const onVisibility = () => {
      const nowVisible = document.visibilityState === 'visible';
      if (nowVisible && paused) {
        paused = false;
        if (rafId === 0) rafId = requestAnimationFrame(animate);
      } else if (!nowVisible) {
        paused = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const start = performance.now();
    const lerpPos = new THREE.Vector3();
    const lerpQuat = new THREE.Quaternion();

    const animate = () => {
      if (!mounted) return;
      if (paused) { rafId = 0; return; }
      const now = performance.now();
      const t = (now - start) / 1000;

      syncStages(now);

      for (const rig of cardRigs) {
        const u = Math.min(1, (now - rig.tweenStart) / rig.tweenDuration);
        const eased = easeInOutCubic(u);
        lerpPos.lerpVectors(rig.fromPos, rig.toPos, eased);
        lerpQuat.copy(rig.fromQuat).slerp(rig.toQuat, eased);
        rig.group.position.copy(lerpPos);
        rig.group.quaternion.copy(lerpQuat);

        // Lifted card gets a gentle hand-held drift: small bob + slow yaw.
        if (rig.stage === 'lifted' && u >= 1) {
          rig.group.position.y = LIFT_POS.y + Math.sin(t * 1.4) * 0.018;
          // Apply a small additional yaw on top of the base quaternion
          const yawDrift = Math.sin(t * 0.7) * 0.05;
          const driftQuat = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(0, yawDrift, 0));
          rig.group.quaternion.copy(STAGE_QUAT.lifted).multiply(driftQuat);
        }
      }

      // Subtle table breath — barely-perceptible y-axis wobble for liveness.
      tableGroup.position.y = Math.sin(t * 0.35) * 0.005;

      composer.render();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    // Resize: container size changes, update renderer + composer + camera.
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      for (const rig of cardRigs) {
        rig.frontMat.dispose();
        rig.backMat.dispose();
        scene.remove(rig.group);
      }
      cardGeom.dispose();
      topGeom.dispose();
      topMat.dispose();
      skirtGeom.dispose();
      skirtMat.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
    // We deliberately ignore prop deps for setup — props update via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn]);

  // Width/height are CSS-driven on the container; updates trigger the
  // ResizeObserver in the setup effect.
  return (
    <div
      ref={containerRef}
      className="table-scene"
      style={{ width, height }}
      aria-hidden
    />
  );
}
