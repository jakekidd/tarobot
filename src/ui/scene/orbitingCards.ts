// Orbiting cards — replaces the old "data orbs" answer counter.
//
// Each survey answer spawns a flat card mesh that orbits the turtle on
// a roughly horizontal plane behind the camera-facing side. Cards travel
// behind the turtle (visible) and clip out toward the front (where they
// would otherwise blind the dialogue box). Real rigid-body rotation
// (constant angular velocity per axis in a vacuum) gives natural tilt
// and wiggle without canned animation curves.
//
// Spawn flow:
//   - User picks an answer → impactStore.fireImpact({x, y, passed})
//   - TarobotScene wires the subscriber to call `spawnCard(passed)`
//   - The cards module manages all positions / rotations / lifetimes

import * as THREE from 'three';

const CARD_W_PX        = 26;     // card width  (≈ tarot 0.6 aspect)
const CARD_H_PX        = 44;     // card height
const CARD_THICKNESS   = 0.4;    // boxgeom z thickness — gives bevel-ish edge
const CARD_CAP         = 80;     // hard cap on simultaneous cards
const ORBIT_RADIUS_MIN_PX  = 110;
const ORBIT_RADIUS_JITTER  = 70;
const ORBIT_HEIGHT_RANGE   = 60; // vertical spread on the orbit plane (small tilt)
const ORBIT_PERIOD_MIN_S   = 18;
const ORBIT_PERIOD_JITTER  = 12;
const SPIN_RANGE_RAD_S     = 0.6; // per-axis spin speed range (radians/sec)
const SPAWN_RISE_S         = 1.3; // ramp from click-y to orbit-y
const SPAWN_ALPHA_S        = 0.4; // fade-in time

// Gold and silver palettes. Gold is the answer counter; silver is "pass".
// Picked to be visible against the deep-violet starfield but NOT bright
// enough to blow out bloom or compete with the dialogue.
const GOLD_FACE_HEX   = 0xb8923f;
const GOLD_EDGE_HEX   = 0x6a4f1f;
const SILVER_FACE_HEX = 0x9aa0aa;
const SILVER_EDGE_HEX = 0x4a4d54;

type CardInternal = {
  group: THREE.Group;
  faceMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.MeshBasicMaterial;
  // orbit parameterization
  radius: number;
  yOnPlane: number;
  theta: number;
  omegaTheta: number;   // orbital angular velocity (radians/sec)
  // self-spin (rigid body in vacuum: constant angular velocity, no torque)
  spinX: number;
  spinY: number;
  spinZ: number;
  // spawn animation
  age: number;
  spawnX: number;
  spawnY: number;
};

export type OrbitingCardsHandle = {
  spawnCard(passed: boolean, clickX: number, clickY: number): void;
  update(dt: number): void;
  dispose(): void;
};

type AnchorRect = { x: number; y: number; width: number; height: number } | null;

/**
 * Create the orbiting-cards system. Spawns cards on demand; calls update()
 * per frame to advance physics + visibility. The system mounts a single
 * THREE.Group into the provided scene; dispose() tears it all down.
 */
export function createOrbitingCards(args: {
  scene: THREE.Scene;
  getAnchor: () => AnchorRect;
  getViewport: () => { w: number; h: number };
}): OrbitingCardsHandle {
  const { scene, getAnchor, getViewport } = args;

  const root = new THREE.Group();
  scene.add(root);

  // Single shared face + edge geometry. Materials per-card so each can
  // fade in independently. BoxGeometry gives the card a thin extruded
  // depth so the edge color reads as a different sliver of light from
  // the face — cheap shading without lights.
  const cardGeom = new THREE.BoxGeometry(CARD_W_PX, CARD_H_PX, CARD_THICKNESS);

  const cards: CardInternal[] = [];

  function spawnCard(passed: boolean, clickX: number, clickY: number): void {
    const vp = getViewport();
    // Recycle oldest if at cap.
    if (cards.length >= CARD_CAP) {
      const old = cards.shift()!;
      root.remove(old.group);
      old.faceMat.dispose();
      old.edgeMat.dispose();
    }

    const faceMat = new THREE.MeshBasicMaterial({
      color: passed ? SILVER_FACE_HEX : GOLD_FACE_HEX,
      transparent: true,
      opacity: 0,            // fade in via update()
      depthWrite: false,     // avoid z-fighting between cards
    });
    const edgeMat = new THREE.MeshBasicMaterial({
      color: passed ? SILVER_EDGE_HEX : GOLD_EDGE_HEX,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    // BoxGeometry has 6 face-groups (one per side). Faces 0,1 are the
    // long sides; 2,3 are top/bottom; 4,5 are the broad card faces.
    // We give the broad faces faceMat and the four edges edgeMat.
    const mats = [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, faceMat];
    const mesh = new THREE.Mesh(cardGeom, mats);
    const group = new THREE.Group();
    group.add(mesh);
    root.add(group);

    const sceneX = clickX - vp.w / 2;
    const sceneY = vp.h / 2 - clickY;
    group.position.set(sceneX, sceneY, -10);

    const radius = ORBIT_RADIUS_MIN_PX + Math.random() * ORBIT_RADIUS_JITTER;
    const yOnPlane = (Math.random() - 0.5) * ORBIT_HEIGHT_RANGE;
    // Start orbit angle so each card enters from the left half of the
    // back arc, then sweeps right. The back arc spans π/2 → 3π/2 (in our
    // convention θ=0 is the front; π is the back); we randomize within
    // the LEFT quarter of the back arc.
    const theta = Math.PI * (0.55 + Math.random() * 0.25);
    const periodS = ORBIT_PERIOD_MIN_S + Math.random() * ORBIT_PERIOD_JITTER;
    const omegaTheta = (Math.PI * 2) / periodS; // positive → CCW from above

    cards.push({
      group,
      faceMat,
      edgeMat,
      radius,
      yOnPlane,
      theta,
      omegaTheta,
      spinX: (Math.random() - 0.5) * SPIN_RANGE_RAD_S,
      spinY: (Math.random() - 0.5) * SPIN_RANGE_RAD_S,
      spinZ: (Math.random() - 0.5) * SPIN_RANGE_RAD_S,
      age: 0,
      spawnX: sceneX,
      spawnY: sceneY,
    });
  }

  function update(dt: number): void {
    const anchor = getAnchor();
    const vp = getViewport();
    const cx = anchor ? anchor.x - vp.w / 2 : 0;
    const cy = anchor ? vp.h / 2 - anchor.y : 0;
    // Orbit center sits at the turtle's anchor. Slight downward bias so
    // the orbit ring crosses the turtle's torso rather than its head.
    const ccy = cy - (anchor ? anchor.height * 0.1 : 0);

    for (const c of cards) {
      c.age += dt;

      // Orbital position. Plane = (cos θ * radius, ccy + yOnPlane, sin θ * radius * Z_SCALE).
      // Z_SCALE < 1 squashes the orbit into a flatter ellipse so the back
      // arc reads cleanly. cos θ → x position; sin θ → z (depth).
      c.theta += c.omegaTheta * dt;
      const Z_SCALE = 1.4;          // > 1 makes the back arc deeper (more dramatic)
      const orbitX = Math.cos(c.theta) * c.radius;
      const orbitZ = Math.sin(c.theta) * c.radius * Z_SCALE;

      // Spawn anim: rise from click position to orbit position over SPAWN_RISE_S.
      const riseT = Math.min(1, c.age / SPAWN_RISE_S);
      const ease = 1 - Math.pow(1 - riseT, 3); // ease-out cubic
      const targetX = cx + orbitX;
      const targetY = ccy + c.yOnPlane;
      const targetZ = orbitZ;
      c.group.position.set(
        c.spawnX + (targetX - c.spawnX) * ease,
        c.spawnY + (targetY - c.spawnY) * ease,
        -10 + (targetZ - (-10)) * ease,
      );

      // Rigid-body rotation in vacuum: pure constant angular velocity.
      c.group.rotation.x += c.spinX * dt;
      c.group.rotation.y += c.spinY * dt;
      c.group.rotation.z += c.spinZ * dt;

      // Visibility — fade out across the FRONT half of the orbit so cards
      // don't fly through the dialogue. sin(θ) tells us depth: positive
      // = front (toward camera), negative = back. We hide cards in the
      // front quarter.
      const sinT = Math.sin(c.theta);
      // Map sinT ∈ [-1, +1] → visibility. visible when sinT < 0 (back),
      // fade when sinT > 0.2, fully hidden by sinT > 0.6.
      let visAlpha = 1;
      if (sinT > 0.2) {
        visAlpha = Math.max(0, 1 - (sinT - 0.2) / 0.4);
      }

      const fadeIn = Math.min(1, c.age / SPAWN_ALPHA_S);
      const alpha = visAlpha * fadeIn;
      c.faceMat.opacity = alpha;
      c.edgeMat.opacity = alpha;
      c.group.visible = alpha > 0.01;
    }
  }

  function dispose(): void {
    for (const c of cards) {
      root.remove(c.group);
      c.faceMat.dispose();
      c.edgeMat.dispose();
    }
    cards.length = 0;
    cardGeom.dispose();
    scene.remove(root);
  }

  return { spawnCard, update, dispose };
}
