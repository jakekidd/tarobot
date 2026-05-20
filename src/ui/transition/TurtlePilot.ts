// Organic turtle motion for the warp phase. He's Crush riding the EAC:
// chilling, swimming around, drifting between perches with intent.
//
// Physics:
//   - Perch state machine. Picks center/left/right at random every
//     3–7s, never repeats. Each perch is a viewport-relative position.
//   - Critically damped spring drives current position toward target.
//     ζ=1 ⇒ no overshoot, natural settle.
//   - Y-axis noise overlay (two incommensurate sines) for "current
//     jitter" so he never reads as grid-locked.
//   - Separate rotation spring for click reactions. kick() adds
//     angular velocity; rotation spring decays it back to zero. The
//     turtle's BASE_ROTATION (face camera) is applied INSIDE WarpTurtle;
//     this controller adds extra rotation on top.
//   - Animation timeScale couples to spring velocity magnitude so the
//     paddle visibly speeds up during perch transitions.
//
// The controller is pure logic — no three.js draws here. WarpScene
// reads .pos/.rot every frame and writes them into the phaseGroup.

import * as THREE from 'three';
import { warpLog } from './warpLog';

export type Perch = 'center' | 'left' | 'right';

const PERCH_HOLD_MIN_S = 3.0;
const PERCH_HOLD_MAX_S = 7.0;

// Spring tuning. Position spring is slow-ish for "deliberate drift";
// rotation spring is a bit snappier so click wobbles recover within a
// second or two.
const POS_FREQ_HZ = 0.55;
const ROT_FREQ_HZ = 0.85;
const POS_OMEGA = 2 * Math.PI * POS_FREQ_HZ;
const ROT_OMEGA = 2 * Math.PI * ROT_FREQ_HZ;

// Click impulse magnitudes (rad/s added to angular velocity).
const KICK_FLIP = 14;
const KICK_SPIN = 14;

// Y-bob: two incommensurate sines. Amplitudes in world px.
const BOB_AMP_A = 18;
const BOB_FREQ_A = 0.42;
const BOB_AMP_B = 9;
const BOB_FREQ_B = 0.71;

// Animation speed mapping. Idle = SLOW; max = FAST. Velocity in px/sec.
const ANIM_SLOW = 0.25;
const ANIM_FAST = 0.95;
const ANIM_VEL_NORM = 280; // px/sec at which we reach FAST

export type TurtlePilot = {
  /** Current spring position in world units (px) relative to scene origin. */
  pos: THREE.Vector3;
  /** Current additional rotation (radians) layered on top of the
   *  turtle's baked face-camera rotation. */
  rot: THREE.Vector3;
  /** Spring velocity (px/sec) — surface for animation-speed coupling. */
  vel: THREE.Vector3;
  /** Current perch — exposed for the debug HUD. */
  perch: () => Perch;
  /** Suggested animation timeScale derived from current velocity. */
  animTimeScale: () => number;
  /** Tick the controller. dt in seconds; t in seconds since mount. */
  update: (dt: number, t: number, viewportW: number, viewportH: number) => void;
  /** Switch to a new perch (random, not the current one). Caller drives
   *  this on dialogue events — see WarpDemo wiring. */
  shiftPerch: () => void;
  /** Inject a rotation impulse — call on click. */
  kick: (kind?: 'flip' | 'spin' | 'random') => void;
  /** Snap back to center perch & zero kick state (e.g. on phase exit). */
  reset: () => void;
};

export function createTurtlePilot(): TurtlePilot {
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const rotVel = new THREE.Vector3();

  let perch: Perch = 'center';
  let perchUntilT = 0;

  function pickNextPerch(): void {
    const others: Perch[] = (['center', 'left', 'right'] as Perch[]).filter((p) => p !== perch);
    perch = others[Math.floor(Math.random() * others.length)] ?? 'center';
    perchUntilT += PERCH_HOLD_MIN_S + Math.random() * (PERCH_HOLD_MAX_S - PERCH_HOLD_MIN_S);
    warpLog(`pilot perch → ${perch}`);
  }

  function perchTarget(w: number, _h: number): THREE.Vector3 {
    // Perch X = ±22% of viewport width; Y bias for left/right so it
    // doesn't look like the same line three times.
    const dx = w * 0.22;
    if (perch === 'left')  return new THREE.Vector3(-dx,  18, 0);
    if (perch === 'right') return new THREE.Vector3( dx, -12, 0);
    return new THREE.Vector3(0, 0, 0);
  }

  return {
    pos, rot, vel,
    perch: () => perch,
    animTimeScale: () => {
      const v = vel.length();
      const u = Math.min(v / ANIM_VEL_NORM, 1);
      return ANIM_SLOW + (ANIM_FAST - ANIM_SLOW) * u;
    },
    update(dt, t, viewportW, viewportH) {
      // Perch advancement is no longer automatic — the caller invokes
      // shiftPerch() on dialogue events (e.g. each time the turtle
      // delivers a line). PERCH_HOLD_MIN_S/MAX_S survive only as
      // tuning constants for fallback callers that want them.
      void t; void perchUntilT;

      // ── Position spring ──
      // Critically damped: ẍ = -ω² (x - x*) - 2ω ẋ
      const target = perchTarget(viewportW, viewportH);
      // Apply Y-bob to the target so he keeps gently bobbing on perch.
      const bob = Math.sin(t * BOB_FREQ_A * 2 * Math.PI) * BOB_AMP_A
                + Math.cos(t * BOB_FREQ_B * 2 * Math.PI) * BOB_AMP_B;
      target.y += bob;

      const dx = target.clone().sub(pos);
      const accel = dx.multiplyScalar(POS_OMEGA * POS_OMEGA)
        .sub(vel.clone().multiplyScalar(2 * POS_OMEGA));
      vel.add(accel.multiplyScalar(dt));
      pos.add(vel.clone().multiplyScalar(dt));

      // ── Rotation spring ──
      // Target rotation = (0, 0, 0) — no extra rotation on top of the
      // turtle's baked face-camera baseline. kick() injects velocity
      // and this spring decays it back.
      const dr = new THREE.Vector3().sub(rot);
      const ra = dr.multiplyScalar(ROT_OMEGA * ROT_OMEGA)
        .sub(rotVel.clone().multiplyScalar(2 * ROT_OMEGA));
      rotVel.add(ra.multiplyScalar(dt));
      rot.add(rotVel.clone().multiplyScalar(dt));
    },
    shiftPerch() {
      pickNextPerch();
    },
    kick(kind = 'random') {
      const actual = kind === 'random' ? (Math.random() < 0.5 ? 'flip' : 'spin') : kind;
      if (actual === 'flip') {
        rotVel.x += (Math.random() < 0.5 ? 1 : -1) * KICK_FLIP;
      } else {
        rotVel.y += (Math.random() < 0.5 ? 1 : -1) * KICK_SPIN;
      }
      warpLog(`pilot kick: ${actual}`);
    },
    reset() {
      pos.set(0, 0, 0);
      vel.set(0, 0, 0);
      rot.set(0, 0, 0);
      rotVel.set(0, 0, 0);
      perch = 'center';
      perchUntilT = 0;
    },
  };
}
