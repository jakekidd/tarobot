// Orbiting cards — visual answer counter.
//
// Each survey pick spawns a flat card that orbits the turtle on a roughly
// horizontal plane. Cards fade as they cross in front of the turtle (so
// they don't block the dialogue), come back into full visibility off to
// the sides and behind. Rigid-body rotation (constant angular velocity
// per axis in a vacuum) gives natural tilt.
//
// Lifecycle: cards live as long as the survey is active. When scope flips
// inactive (Survey unmounts), all live cards fade out smoothly and the
// system goes quiet. When an undo fires, the MOST RECENT card breaks off
// its orbit, flies up-left toward the camera, and shatters into drifting
// shards.
//
// Spawn flow:
//   - User picks an answer → impactStore.fireImpact({x, y, passed})
//   - TarobotScene forwards into spawnCard()
//   - Module manages positions / rotations / lifetimes
//
// Burn flow:
//   - User taps undo → Survey.tsx → burnCardStore.fireBurnCard()
//   - Module pulls the newest card, runs burn sequence

import * as THREE from 'three';
import { getCardsActive, subscribeCardsActive } from './cardsScopeStore';
import { subscribeBurnCard } from './burnCardStore';

const CARD_W_PX        = 26;
const CARD_H_PX        = 44;
const CARD_THICKNESS   = 0.4;
const CARD_CAP         = 80;
const ORBIT_RADIUS_MIN_PX  = 110;
const ORBIT_RADIUS_JITTER  = 70;
const ORBIT_HEIGHT_RANGE   = 60;
const ORBIT_PERIOD_MIN_S   = 18;
const ORBIT_PERIOD_JITTER  = 12;
const SPIN_RANGE_RAD_S     = 0.6;
const SPAWN_RISE_S         = 1.3;
const SPAWN_ALPHA_S        = 0.4;
// Cap final alpha — keeps cards from looking "shiny" / too solid. The
// originals were full-opacity gold which read as plasticky; sub-1 alpha
// makes them feel like scene atmosphere instead.
const MAX_ALPHA            = 0.72;
// When scope flips inactive (user leaves survey), cards fade out over
// this window before being disposed.
const SCOPE_FADE_OUT_S     = 0.55;

// Burn-on-undo timing
const BURN_FLY_S           = 0.7;     // card lerps from orbit to upper-left target
const SHARDS_PER_BURN      = 11;      // randomized triangle count
const SHARD_LIFE_MIN_S     = 1.3;
const SHARD_LIFE_JITTER_S  = 0.7;

type BurnPhase = 'none' | 'flying' | 'done';

type CardInternal = {
  group: THREE.Group;
  faceMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;     // for shards on burn
  // orbit — each card has its OWN tilted plane so the cluster distributes
  // out of the strict horizontal band the original used.
  radius: number;
  yOnPlane: number;
  theta: number;
  omegaTheta: number;
  // tiltAxisX/Z + tiltAngle define rotation applied to the canonical
  // XZ-orbit position. Axis is a unit vector in the XZ plane; angle is
  // ±~0.7 rad. The result is each card orbits on a uniquely tilted disc
  // around the anchor — vertical spread comes from this rather than
  // a fixed yOnPlane band.
  tiltAxisX: number;
  tiltAxisZ: number;
  tiltAngle: number;
  // self-spin
  spinX: number;
  spinY: number;
  spinZ: number;
  // spawn animation
  age: number;
  spawnX: number;
  spawnY: number;
  // scope-fade
  fadingOut: boolean;
  fadeOutAge: number;
  // burn
  burnPhase: BurnPhase;
  burnAge: number;
  burnFromPos: THREE.Vector3;
  burnToPos: THREE.Vector3;
  burnFromRot: THREE.Euler;
};

type Shard = {
  mesh: THREE.Mesh;
  geom: THREE.BufferGeometry;
  mat: THREE.MeshBasicMaterial;
  velocity: THREE.Vector3;
  angVel: THREE.Vector3;
  age: number;
  maxLife: number;
};

export type OrbitingCardsHandle = {
  spawnCard(passed: boolean, clickX: number, clickY: number): void;
  update(dt: number): void;
  dispose(): void;
};

type AnchorRect = { x: number; y: number; width: number; height: number } | null;

/**
 * Create the orbiting-cards system. Spawns cards on demand, runs update()
 * per frame to advance physics + visibility. Mounts a single THREE.Group
 * into the provided scene; dispose() tears everything down.
 */
export function createOrbitingCards(args: {
  scene: THREE.Scene;
  getAnchor: () => AnchorRect;
  getViewport: () => { w: number; h: number };
}): OrbitingCardsHandle {
  const { scene, getAnchor, getViewport } = args;

  const root = new THREE.Group();
  scene.add(root);

  // Separate group for burn-effect shards so they can be culled / cleared
  // without touching the orbiting cards above them.
  const burnRoot = new THREE.Group();
  scene.add(burnRoot);

  const cardGeom = new THREE.BoxGeometry(CARD_W_PX, CARD_H_PX, CARD_THICKNESS);

  const cards: CardInternal[] = [];
  const shards: Shard[] = [];

  // Color wheel: pick from the full HSL hue range, muted saturation, mid
  // lightness. Avoids the metallic-gold "shiny" feel the user pushed back
  // on while giving each card its own identity in the orbit.
  function pickHueColor(): THREE.Color {
    const hue = Math.random();
    const sat = 0.42 + Math.random() * 0.22;     // 0.42–0.64 — muted
    const lit = 0.5 + Math.random() * 0.1;       // 0.5–0.6
    return new THREE.Color().setHSL(hue, sat, lit);
  }

  function spawnCard(_passed: boolean, clickX: number, clickY: number): void {
    if (!getCardsActive()) return;
    const vp = getViewport();
    if (cards.length >= CARD_CAP) {
      const old = cards.shift()!;
      root.remove(old.group);
      old.faceMat.dispose();
      old.edgeMat.dispose();
    }

    const baseColor = pickHueColor();
    const edgeColor = baseColor.clone().multiplyScalar(0.45);

    const faceMat = new THREE.MeshBasicMaterial({
      color: baseColor.getHex(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const edgeMat = new THREE.MeshBasicMaterial({
      color: edgeColor.getHex(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
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
    // Uniform random over [0, 2π] — cards distribute evenly around the
    // turtle from the moment they spawn.
    const theta = Math.random() * Math.PI * 2;
    const periodS = ORBIT_PERIOD_MIN_S + Math.random() * ORBIT_PERIOD_JITTER;
    // Random orbit direction so cards don't all sweep the same way.
    const sign = Math.random() < 0.5 ? -1 : 1;
    const omegaTheta = sign * ((Math.PI * 2) / periodS);
    // Tilted orbit plane per card. Each card's plane is rotated around a
    // random horizontal axis (in XZ) by ±~0.7 rad. Result: cards distribute
    // through a sphere-ish cluster around the anchor instead of clustering
    // on a single horizontal band that clipped at screen edges.
    const tiltAxisTheta = Math.random() * Math.PI * 2;
    const tiltAxisX = Math.cos(tiltAxisTheta);
    const tiltAxisZ = Math.sin(tiltAxisTheta);
    const tiltAngle = (Math.random() - 0.5) * 1.4;   // ±0.7 rad ≈ ±40°

    cards.push({
      group,
      faceMat,
      edgeMat,
      baseColor,
      radius,
      yOnPlane,
      theta,
      omegaTheta,
      tiltAxisX,
      tiltAxisZ,
      tiltAngle,
      spinX: (Math.random() - 0.5) * SPIN_RANGE_RAD_S,
      spinY: (Math.random() - 0.5) * SPIN_RANGE_RAD_S,
      spinZ: (Math.random() - 0.5) * SPIN_RANGE_RAD_S,
      age: 0,
      spawnX: sceneX,
      spawnY: sceneY,
      fadingOut: false,
      fadeOutAge: 0,
      burnPhase: 'none',
      burnAge: 0,
      burnFromPos: new THREE.Vector3(),
      burnToPos: new THREE.Vector3(),
      burnFromRot: new THREE.Euler(),
    });
  }

  // ─── burn animation ─────────────────────────────────────────

  function startBurn(c: CardInternal): void {
    if (c.burnPhase !== 'none') return;
    const vp = getViewport();
    // Target: upper-left of viewport, pulled forward in Z so the card sits
    // visibly in front of the turtle as it dissolves.
    const targetX = -vp.w * 0.32;
    const targetY = vp.h * 0.32;
    const targetZ = 60;
    c.burnPhase = 'flying';
    c.burnAge = 0;
    c.burnFromPos.copy(c.group.position);
    c.burnToPos.set(targetX, targetY, targetZ);
    c.burnFromRot.copy(c.group.rotation);
  }

  function disposeCard(c: CardInternal): void {
    root.remove(c.group);
    c.faceMat.dispose();
    c.edgeMat.dispose();
  }

  function spawnShardsAt(origin: THREE.Vector3, baseColor: THREE.Color): void {
    for (let i = 0; i < SHARDS_PER_BURN; i++) {
      const w = CARD_W_PX * (0.2 + Math.random() * 0.35);
      const h = CARD_H_PX * (0.18 + Math.random() * 0.32);
      // Three random vertices in a small box centered on origin — random
      // triangle, asymmetric on purpose. Indices are implicit for a single
      // unindexed triangle.
      const verts = new Float32Array([
        (Math.random() - 0.5) * w, (Math.random() - 0.5) * h, 0,
        (Math.random() - 0.5) * w, (Math.random() - 0.5) * h, 0,
        (Math.random() - 0.5) * w, (Math.random() - 0.5) * h, 0,
      ]);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));

      // Start color: blend the card's base color toward ember orange so the
      // shatter reads as a burn rather than a confetti spray.
      const ember = new THREE.Color(1.0, 0.55, 0.05);
      const startColor = baseColor.clone().lerp(ember, 0.7);
      const mat = new THREE.MeshBasicMaterial({
        color: startColor.getHex(),
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(origin);
      mesh.position.x += (Math.random() - 0.5) * 14;
      mesh.position.y += (Math.random() - 0.5) * 14;
      burnRoot.add(mesh);
      shards.push({
        mesh, geom, mat,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 70,
          30 + Math.random() * 55,          // strong upward bias
          (Math.random() - 0.5) * 30,
        ),
        angVel: new THREE.Vector3(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
        ),
        age: 0,
        maxLife: SHARD_LIFE_MIN_S + Math.random() * SHARD_LIFE_JITTER_S,
      });
    }
  }

  function updateShards(dt: number): void {
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i]!;
      s.age += dt;
      const t = s.age / s.maxLife;
      if (t >= 1) {
        burnRoot.remove(s.mesh);
        s.geom.dispose();
        s.mat.dispose();
        shards.splice(i, 1);
        continue;
      }
      s.mesh.position.x += s.velocity.x * dt;
      s.mesh.position.y += s.velocity.y * dt;
      s.mesh.position.z += s.velocity.z * dt;
      // Damp velocity so shards drift to a slow rise.
      s.velocity.multiplyScalar(0.985);
      // Add a tiny upward buoyancy late in life so the trail keeps drifting
      // up even as horizontal momentum dies.
      s.velocity.y += 6 * dt;
      s.mesh.rotation.x += s.angVel.x * dt;
      s.mesh.rotation.y += s.angVel.y * dt;
      s.mesh.rotation.z += s.angVel.z * dt;
      // Shrink + fade together
      const sc = Math.max(0, 1 - t);
      s.mesh.scale.set(sc, sc, sc);
      s.mat.opacity = Math.max(0, 1 - t * 0.92);
      // Color: ember → ash (warm orange → dim warm gray)
      const r = THREE.MathUtils.lerp(1.0, 0.42, t);
      const g = THREE.MathUtils.lerp(0.55, 0.38, t);
      const b = THREE.MathUtils.lerp(0.05, 0.34, t);
      s.mat.color.setRGB(r, g, b);
    }
  }

  // ─── main update ────────────────────────────────────────────

  function update(dt: number): void {
    const anchor = getAnchor();
    const vp = getViewport();
    const cx = anchor ? anchor.x - vp.w / 2 : 0;
    const cy = anchor ? vp.h / 2 - anchor.y : 0;
    const ccy = cy - (anchor ? anchor.height * 0.1 : 0);

    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i]!;
      c.age += dt;

      // ── burn-flying branch overrides normal orbit ────────────
      if (c.burnPhase === 'flying') {
        c.burnAge += dt;
        const t = Math.min(1, c.burnAge / BURN_FLY_S);
        const eased = 1 - Math.pow(1 - t, 3);
        c.group.position.lerpVectors(c.burnFromPos, c.burnToPos, eased);
        // Rotate to face camera (zero out the tumble) as it flies.
        c.group.rotation.x = c.burnFromRot.x * (1 - eased);
        c.group.rotation.y = c.burnFromRot.y * (1 - eased);
        c.group.rotation.z = c.burnFromRot.z * (1 - eased);
        // Stay fully visible during the flight — this is the moment.
        c.faceMat.opacity = MAX_ALPHA;
        c.edgeMat.opacity = MAX_ALPHA;
        if (t >= 1) {
          // Shatter and remove the card.
          spawnShardsAt(c.group.position, c.baseColor);
          disposeCard(c);
          cards.splice(i, 1);
        }
        continue;
      }

      // ── scope fade-out: dispose smoothly when survey unmounts ─
      if (c.fadingOut) {
        c.fadeOutAge += dt;
        const t = Math.min(1, c.fadeOutAge / SCOPE_FADE_OUT_S);
        const a = (1 - t) * MAX_ALPHA;
        c.faceMat.opacity = a;
        c.edgeMat.opacity = a;
        if (t >= 1) {
          disposeCard(c);
          cards.splice(i, 1);
        }
        continue;
      }

      // ── normal orbital update ───────────────────────────────
      c.theta += c.omegaTheta * dt;
      // Canonical orbit position on the XZ plane.
      const Z_SCALE = 1.4;
      let pX = Math.cos(c.theta) * c.radius;
      let pY = c.yOnPlane;
      let pZ = Math.sin(c.theta) * c.radius * Z_SCALE;
      // Rotate around the per-card tilt axis (in XZ). Uses Rodrigues'
      // formula with the axis confined to XZ (zero Y component) so the
      // closed-form simplifies — k×v reduces to (-kZ*pY, kZ*pX − kX*pZ, kX*pY)
      // and k·v = kX*pX + kZ*pZ.
      if (c.tiltAngle !== 0) {
        const ax = c.tiltAxisX;
        const az = c.tiltAxisZ;
        const ang = c.tiltAngle;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const dot = ax * pX + az * pZ;     // k · v
        // k × v
        const cx_ = -az * pY;
        const cy_ = az * pX - ax * pZ;
        const cz_ = ax * pY;
        const oneMinusCos = 1 - cosA;
        const rotX = pX * cosA + cx_ * sinA + ax * dot * oneMinusCos;
        const rotY = pY * cosA + cy_ * sinA;                            // k.y === 0
        const rotZ = pZ * cosA + cz_ * sinA + az * dot * oneMinusCos;
        pX = rotX; pY = rotY; pZ = rotZ;
      }

      const riseT = Math.min(1, c.age / SPAWN_RISE_S);
      const ease = 1 - Math.pow(1 - riseT, 3);
      const targetX = cx + pX;
      const targetY = ccy + pY;
      const targetZ = pZ;
      c.group.position.set(
        c.spawnX + (targetX - c.spawnX) * ease,
        c.spawnY + (targetY - c.spawnY) * ease,
        -10 + (targetZ - (-10)) * ease,
      );

      c.group.rotation.x += c.spinX * dt;
      c.group.rotation.y += c.spinY * dt;
      c.group.rotation.z += c.spinZ * dt;

      // Visibility by rotated Z:
      //   pZ > 0  →  card is between the camera and the anchor (in front
      //              of the turtle from camera POV). Fade progressively
      //              to 10% alpha at front-most.
      //   pZ ≤ 0  →  card is to the side / behind. Fully visible.
      // Normalized to the orbit's max Z reach so the curve is consistent
      // across radii.
      const maxZ = c.radius * Z_SCALE;
      const zNorm = Math.max(-1, Math.min(1, pZ / maxZ));
      const angleAlpha = zNorm > 0 ? (1 - 0.9 * zNorm) : 1;

      const fadeIn = Math.min(1, c.age / SPAWN_ALPHA_S);
      const alpha = MAX_ALPHA * angleAlpha * fadeIn;
      c.faceMat.opacity = alpha;
      c.edgeMat.opacity = alpha;
      c.group.visible = alpha > 0.01;
    }

    updateShards(dt);
  }

  // ─── outside wiring: scope + burn subscriptions ─────────────

  const unsubScope = subscribeCardsActive((active) => {
    if (active) return;
    // Scope going inactive: fade out every live, non-burning card.
    for (const c of cards) {
      if (c.burnPhase === 'none') {
        c.fadingOut = true;
        c.fadeOutAge = 0;
      }
    }
  });

  const unsubBurn = subscribeBurnCard(() => {
    // Burn the most-recently-spawned card that isn't already burning or
    // fading. If none exists, no-op.
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i]!;
      if (c.burnPhase === 'none' && !c.fadingOut) {
        startBurn(c);
        return;
      }
    }
  });

  function dispose(): void {
    unsubScope();
    unsubBurn();
    for (const c of cards) {
      root.remove(c.group);
      c.faceMat.dispose();
      c.edgeMat.dispose();
    }
    cards.length = 0;
    for (const s of shards) {
      burnRoot.remove(s.mesh);
      s.geom.dispose();
      s.mat.dispose();
    }
    shards.length = 0;
    cardGeom.dispose();
    scene.remove(root);
    scene.remove(burnRoot);
  }

  return { spawnCard, update, dispose };
}
