// Cat — sprite-based mascot. Two parallax textured planes
// repainted per frame from a JSON sprite sheet. Reacts to mouse
// (drift away + dwell-triggered tremor), blinks on a random cadence,
// spins its eyes when the LLM is mid-thought (`ctx.dizzy`).
//
// Implements the Mascot interface in ./types.ts so it's swappable with
// any other mascot — same construction site, same per-frame call.
//
// Deferred (not yet ported from the old in-scene impl):
//   - explosion-on-swap (cat→eyes "shatter into 5x5 chunks") — would
//     need a Mascot lifecycle hook for "you're about to be hidden."
//     TODO when the next mascot needs a custom transition too.

import * as THREE from 'three';
import spriteData from '../../reader/sprite.json';
import { paintFrame, type SpriteFrame } from '../../reader/spriteCanvas';
import type { Mascot, MascotContext } from './types';

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

// ─── Tunables (cat-specific; moved with the cat) ───────────

const CAT_DEPTH = 0.16;             // parallax distance between front + back planes

const VIBRATE_DWELL_S = 3.2;        // mouse hover this long → trigger tremor
const VIBRATE_DURATION_S = 1.5;
const VIBRATE_COOLDOWN_S = 2.5;

const DIZZY_PEAK_MULTIPLIER = 10;   // unused here; kept for parity if needed later
const DIZZY_EYE_FRAME_MS = 80;      // ms per frame when eye-spin override is on
// look-direction frame indices in clockwise order from "up":
//   2 up, 7 up-right, 5 right, 9 down-right, 3 down, 8 down-left, 4 left, 6 up-left
const DIZZY_EYE_CYCLE = [2, 7, 5, 9, 3, 8, 4, 6];

// Unused-multiplier suppression
void DIZZY_PEAK_MULTIPLIER;

// ─── Factory ───────────────────────────────────────────────

export function createCatMascot(): Mascot {
  // Sprite canvas — repainted on every frame-index change (not every tick).
  const spriteCanvas = document.createElement('canvas');
  const spriteCtx = spriteCanvas.getContext('2d')!;
  spriteCtx.imageSmoothingEnabled = false;

  const tex = new THREE.CanvasTexture(spriteCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.05,
  });
  const geom = new THREE.PlaneGeometry(1, 1);

  // Two coplanar planes — back sits CAT_DEPTH behind front, so any yaw/pitch
  // reveals a parallax slab. Same texture on both.
  const front = new THREE.Mesh(geom, mat);
  front.position.z = 0;
  const back = new THREE.Mesh(geom, mat);
  back.position.z = -CAT_DEPTH;

  const group = new THREE.Group();
  group.add(back);                  // back first so front overlays it
  group.add(front);

  // Sprite state — current frame, blink timer, shuffle timer.
  const fs = {
    state: 'idle',
    shuffleIdx: 1,                  // current "look around" frame; never 0
    nextShuffleAt: 0,
    blinking: false,
    nextBlinkAtMs: 0,
    blinkEndAtMs: 0,
  };
  let lastFrameIdx = -1;

  // Mouse-spring state — drift away from cursor.
  const hoverVel = { x: 0, y: 0 };
  const hoverOffset = { x: 0, y: 0 };
  const tiltVel = { x: 0, y: 0 };
  const tiltOffset = { x: 0, y: 0 };

  // Dwell-triggered vibration (after the cursor hovers VIBRATE_DWELL_S).
  let hoverDwellSec = 0;
  let vibrateUntilMs = 0;
  let vibrateLastFiredAt = -999;

  // Dizzy eye-spin: tracks the instant dizzy turned ON so the spin starts
  // at frame 0 of the cycle.
  let prevDizzy = false;
  let dizzyEnteredAt = 0;

  function update(ctx: MascotContext): void {
    const now = performance.now();
    const { dt, t, mouse, dizzy } = ctx;

    // Dizzy-edge detection.
    if (dizzy && !prevDizzy) dizzyEnteredAt = now;
    prevDizzy = dizzy;

    // Dwell + vibrate.
    if (mouse.close) {
      hoverDwellSec += dt;
      if (
        hoverDwellSec >= VIBRATE_DWELL_S &&
        t - vibrateLastFiredAt > VIBRATE_COOLDOWN_S
      ) {
        vibrateUntilMs = now + VIBRATE_DURATION_S * 1000;
        vibrateLastFiredAt = t;
        hoverDwellSec = 0;
      }
    } else {
      hoverDwellSec = Math.max(0, hoverDwellSec - dt * 0.6);
    }
    const vibrating = now < vibrateUntilMs;

    // Independent blink algorithm (idle only). 90% fast (~80-140ms),
    // 10% slow (~200-310ms). Interval 1.8-5.6s.
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

    // Shuffle pick (skip index 0 = blink).
    const cycleMs = (stateData.ms ?? 1500) * 1.4;
    if (mode === 'shuffle' && frames.length > 2 && now >= fs.nextShuffleAt) {
      fs.shuffleIdx = 1 + Math.floor(Math.random() * (frames.length - 1));
      fs.nextShuffleAt = now + cycleMs;
    } else if (mode === 'loop' && frames.length > 1 && now >= fs.nextShuffleAt) {
      fs.shuffleIdx = ((fs.shuffleIdx) % (frames.length - 1)) + 1;
      fs.nextShuffleAt = now + cycleMs;
    }

    // Resolve frame.
    let frameIdx: number;
    if (dizzy) {
      const idx = Math.floor((now - dizzyEnteredAt) / DIZZY_EYE_FRAME_MS) % DIZZY_EYE_CYCLE.length;
      frameIdx = DIZZY_EYE_CYCLE[idx] ?? 1;
    } else if (fs.blinking) {
      frameIdx = 0;                              // eyes closed
    } else if (vibrating) {
      frameIdx = 2;                              // looking up — startled
    } else if (mouse.close && fs.state === 'idle' && frames.length >= 10) {
      frameIdx = lookFrameForDirection(mouse.dx, mouse.dy);
    } else {
      frameIdx = fs.shuffleIdx;
    }
    // Repaint only on frame-index change — saves a paint per tick.
    if (frameIdx !== lastFrameIdx) {
      const f = frames[frameIdx] ?? frames[1] ?? frames[0];
      if (f) {
        paintFrame(spriteCtx, f, '#7c3aed', '#000000');
        tex.needsUpdate = true;
      }
      lastFrameIdx = frameIdx;
    }

    // Spring drift away from mouse (cancelled during vibration so the cat
    // returns to center deliberately, then trembles in place).
    let targetOffsetX = 0, targetOffsetY = 0;
    if (mouse.close && !vibrating) {
      const mag = Math.hypot(mouse.dx, mouse.dy) || 1;
      targetOffsetX = -(mouse.dx / mag) * mouse.intensity * 0.35;
      targetOffsetY = -(mouse.dy / mag) * mouse.intensity * 0.22;
    }
    const springRate = vibrating ? 14 : 9;
    hoverVel.x += (targetOffsetX - hoverOffset.x) * springRate * dt;
    hoverVel.y += (targetOffsetY - hoverOffset.y) * springRate * dt;
    hoverVel.x *= 0.86;
    hoverVel.y *= 0.86;
    hoverOffset.x += hoverVel.x * dt;
    hoverOffset.y += hoverVel.y * dt;

    // Vibration jitter — subtle L/R tremor only.
    const purrJitterX = vibrating ? (Math.random() - 0.5) * 0.018 : 0;
    const purrJitterY = 0;

    // Ambient float + tilt.
    const tiltZ = (
      Math.sin(t * 0.43) * 0.5 +
      Math.sin(t * 0.79) * 0.3 +
      Math.sin(t * 1.27) * 0.2
    ) * 0.06;
    const yaw = Math.sin(t * 0.31) * 0.06;
    const pitch = -0.04 + Math.sin(t * 0.46) * 0.025;

    // Mouse-bias tilt — lean toward the cursor while it's in the hitbox.
    // Without the anchor's actual size, normalize against a sensible
    // baseline; this matches the prior in-scene behavior closely.
    const targetTiltX = mouse.close ? clamp(-mouse.dy * 0.005, -1, 1) * 0.18 : 0;
    const targetTiltY = mouse.close ? clamp(mouse.dx * 0.005, -1, 1) * 0.22 : 0;
    tiltVel.x += (targetTiltX - tiltOffset.x) * 9 * dt;
    tiltVel.y += (targetTiltY - tiltOffset.y) * 9 * dt;
    tiltVel.x *= 0.85;
    tiltVel.y *= 0.85;
    tiltOffset.x += tiltVel.x * dt;
    tiltOffset.y += tiltVel.y * dt;

    group.rotation.z = tiltZ;
    group.rotation.y = yaw + tiltOffset.y;
    group.rotation.x = pitch + tiltOffset.x;
    group.position.x = Math.sin(t * 0.27) * 0.02 + hoverOffset.x + purrJitterX;
    group.position.y = Math.sin(t * 0.55) * 0.03 + hoverOffset.y + purrJitterY;
  }

  function dispose(): void {
    geom.dispose();
    mat.dispose();
    tex.dispose();
    if (group.parent) group.parent.remove(group);
  }

  return { group, update, dispose };
}

// ─── Helpers ───────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Map a cat→mouse vector to one of the 8 directional look frames of the idle
 * state. Sprite frame indices used:
 *   2 up, 3 down, 4 left, 5 right, 6 up-left, 7 up-right, 8 down-left, 9 down-right
 * Scene coords: +x right, +y up.
 */
function lookFrameForDirection(dx: number, dy: number): number {
  const a = (Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2);
  const sector = Math.floor(a / (Math.PI / 4));     // 0..7
  const SECTOR_TO_FRAME = [5, 7, 2, 6, 4, 8, 3, 9];
  return SECTOR_TO_FRAME[sector] ?? 1;
}
