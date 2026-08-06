// The rig — two eyes that are one creature. A single group holds both
// eye quads and the membrane that visually tethers them; both eyes
// converge on one gaze target (vergence), wander on one shared
// saccade stream, and morph between looks together. Nothing here
// floats independently — that was the ping-pong-ball era.

import * as THREE from 'three';
import { Cord } from './cord';
import { createEyeMaterial, createMembraneMaterial, writePalette } from './eyeMaterial';
import { FeedbackLoop } from './feedback';
import { FIELD_MODES, LOOKS, sessionGenome, type EyePairing, type LookName, type SessionGenome } from './looks';
import { EYE_ASPECT, MOTION, blinkEnvelope, saccade, splitGaze } from './math';

// How gaze is spent. 'pupil' slides the pupil across a stationary eye
// (the decal look); 'eye' turns the whole body and pins the pupil
// centered (doll eyes); 'both' splits it, which is what living eyes do.
export type MotionMode = 'pupil' | 'eye' | 'both';

const BODY_SHARE: Record<MotionMode, number> = { pupil: 0, eye: 1, both: MOTION.bodyShare };

export type EyeRigOptions = {
  seed?: number;
  pairing?: EyePairing;
  eyeWidth?: number;
  separation?: number;
  grade?: number;
  membrane?: boolean;
  motion?: MotionMode;
  cords?: boolean;
};

type EyeSlot = {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  socket: THREE.Group;
  cord: Cord | null;
  home: THREE.Vector3;
  gazeSmooth: THREE.Vector2;
  bodySmooth: THREE.Vector2;
};

const BLINK_SECONDS = 0.26;

export class EyeRig {
  readonly group = new THREE.Group();
  readonly genome: SessionGenome;

  private eyes: [EyeSlot, EyeSlot];
  private membraneMat: THREE.ShaderMaterial | null = null;
  private feedback: FeedbackLoop;

  private lookFrom: LookName;
  private lookTo: LookName;
  private lookMix = 1;
  private fadeRate = 0;

  private gazeTarget = new THREE.Vector3(0, 0, 3);
  private pulseLevel = 0;
  private baseLid = 0;
  private blinkAt = -1;

  private separation: number;
  private eyeWidth: number;
  private motionMode: MotionMode;

  private worldPos = new THREE.Vector3();
  private toTarget = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private fwd = new THREE.Vector3();

  constructor(opts: EyeRigOptions = {}) {
    const seed = opts.seed ?? 1;
    this.genome = sessionGenome(seed, opts.pairing ?? 'match');
    this.eyeWidth = opts.eyeWidth ?? 0.46;
    this.separation = opts.separation ?? 0.62;
    this.motionMode = opts.motion ?? 'both';
    this.lookFrom = 'nebula';
    this.lookTo = 'nebula';

    const h = this.eyeWidth * EYE_ASPECT;
    const geom = new THREE.PlaneGeometry(this.eyeWidth, this.eyeWidth);
    // square quad: the ellipse mask lives in the shader, and a square
    // canvas keeps eye-space isotropic for the fields

    const mk = (eyeIndex: 0 | 1): EyeSlot => {
      const look = LOOKS[this.lookTo];
      const mat = createEyeMaterial(
        this.genome.paletteFor(look, eyeIndex),
        this.genome.rose,
        // near-zero phase split: matched flowers, organic desync
        eyeIndex * 0.13,
      );
      mat.uniforms.uGrade.value = opts.grade ?? 0.75;
      const mesh = new THREE.Mesh(geom, mat);

      // socket: the pivot the eye body turns inside. The eye rotates
      // about it, the cord hangs off it, so the stalk follows the eye
      // wherever it looks instead of sliding off the back.
      const socket = new THREE.Group();
      const side = eyeIndex === 0 ? -1 : 1;
      socket.position.set(side * (this.separation / 2), 0, 0);
      socket.add(mesh);
      this.group.add(socket);

      let cord: Cord | null = null;
      if (opts.cords !== false) {
        cord = new Cord({
          phase: eyeIndex * 0.5,
          length: this.eyeWidth * 4.2,
          radius: this.eyeWidth * 0.26,
          splay: side * 0.6,
        });
        cord.mesh.position.z = -this.eyeWidth * 0.3;
        socket.add(cord.mesh);
      }

      return {
        mesh,
        mat,
        socket,
        cord,
        home: socket.position.clone(),
        gazeSmooth: new THREE.Vector2(),
        bodySmooth: new THREE.Vector2(),
      };
    };
    this.eyes = [mk(0), mk(1)];

    if (opts.membrane !== false) {
      const mw = this.separation + this.eyeWidth * 1.9;
      const mh = h * 2.6;
      const ex = this.separation / 2 / (mw / 2);
      this.membraneMat = createMembraneMaterial(
        LOOKS[this.lookTo].palette,
        new THREE.Vector2(-ex, 0),
        new THREE.Vector2(ex, 0),
      );
      const membrane = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), this.membraneMat);
      membrane.position.z = -0.02;
      membrane.renderOrder = -1;
      this.group.add(membrane);
    }

    this.feedback = new FeedbackLoop(LOOKS.trails.palette);
    this.feedback.setInkMode(FIELD_MODES.spiral);
    this.applyLook();
  }

  setLook(name: LookName, fadeSeconds = 1.4): void {
    if (name === this.lookTo) return;
    this.lookFrom = this.lookMix >= 1 ? this.lookTo : this.lookFrom;
    this.lookTo = name;
    // an instant cut is mix=1 outright — a rate of Infinity would NaN
    // on a zero-dt frame and poison the mix forever
    this.lookMix = fadeSeconds <= 0 ? 1 : 0;
    this.fadeRate = fadeSeconds <= 0 ? 0 : 1 / fadeSeconds;
    this.applyLook();
  }

  get look(): LookName {
    return this.lookTo;
  }

  setGazeTarget(target: THREE.Vector3): void {
    this.gazeTarget.copy(target);
  }

  // subtitle beat / reveal — a fast shimmer that decays upstream
  pulse(): void {
    this.pulseLevel = 1;
  }

  // sustained heaviness, 0 open … 1 sealed (drowsy lids, not a blink)
  setLid(v: number): void {
    this.baseLid = THREE.MathUtils.clamp(v, 0, 1);
  }

  // one deliberate blink; the rig never blinks on its own
  blink(): void {
    if (this.blinkAt < 0) this.blinkAt = 0;
  }

  private applyLook(): void {
    const from = LOOKS[this.lookFrom];
    const to = LOOKS[this.lookTo];
    this.eyes.forEach((eye, i) => {
      const idx = i as 0 | 1;
      writePalette(eye.mat, 0, this.genome.paletteFor(from, idx));
      writePalette(eye.mat, 1, this.genome.paletteFor(to, idx));
      eye.mat.uniforms.uModeFrom.value = from.mode;
      eye.mat.uniforms.uModeTo.value = to.mode;
      eye.mat.uniforms.uSpeedFrom.value = from.speed;
      eye.mat.uniforms.uSpeedTo.value = to.speed;
    });
    if (this.membraneMat) {
      writePalette(this.membraneMat, 0, from.palette);
      writePalette(this.membraneMat, 1, to.palette);
    }
  }

  private usesTrails(): boolean {
    return (
      LOOKS[this.lookTo].mode === FIELD_MODES.trails ||
      (this.lookMix < 1 && LOOKS[this.lookFrom].mode === FIELD_MODES.trails)
    );
  }

  update(time: number, dt: number, renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (this.lookMix < 1) this.lookMix = Math.min(1, this.lookMix + dt * this.fadeRate);
    if (this.pulseLevel > 0) this.pulseLevel = Math.max(0, this.pulseLevel - dt * 1.4);

    let blinkLid = 0;
    if (this.blinkAt >= 0) {
      this.blinkAt += dt;
      const u = this.blinkAt / BLINK_SECONDS;
      if (u >= 1) this.blinkAt = -1;
      else blinkLid = blinkEnvelope(u);
    }
    const lid = Math.max(this.baseLid, blinkLid);

    if (this.usesTrails()) this.feedback.step(renderer, time);

    // billboard the whole rig toward the camera — the eyes are one
    // face, they turn together or not at all
    this.group.quaternion.copy((camera as THREE.PerspectiveCamera).quaternion);

    const from = LOOKS[this.lookFrom];
    const to = LOOKS[this.lookTo];
    const pupilTarget = THREE.MathUtils.lerp(from.pupil, to.pupil, this.lookMix);
    const energy = THREE.MathUtils.lerp(from.energy, to.energy, this.lookMix);

    // shared camera basis for projecting gaze into eye space
    this.right.setFromMatrixColumn(this.group.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(this.group.matrixWorld, 1).normalize();
    this.fwd.setFromMatrixColumn(this.group.matrixWorld, 2).normalize();

    const wander = saccade(time, 0);

    this.eyes.forEach((eye, i) => {
      const u = eye.mat.uniforms;
      u.uTime.value = time;
      u.uLid.value = lid;
      u.uEnergy.value = energy;
      u.uPulse.value = this.pulseLevel;
      u.uLookMix.value = this.lookMix;
      if (this.usesTrails()) u.uFeedback.value = this.feedback.texture;

      const ps = u.uPupil.value as number;
      u.uPupil.value = ps + (pupilTarget - ps) * Math.min(1, dt * 4);

      // vergence: each eye aims from its OWN position — near targets
      // cross the eyes, which is what "looking at you" is made of
      eye.socket.getWorldPosition(this.worldPos);
      this.toTarget.copy(this.gazeTarget).sub(this.worldPos).normalize();
      const gx = this.toTarget.dot(this.right);
      const gy = this.toTarget.dot(this.up);
      const gz = Math.abs(this.toTarget.dot(this.fwd));

      const split = splitGaze(gx, gy, gz, BODY_SHARE[this.motionMode], 0.3);
      const sac = saccade(time, i);

      // the body turns slowly (mass), the pupil catches up fast —
      // that lag is most of what makes the pair read as alive
      eye.bodySmooth.lerp(
        new THREE.Vector2(split.bodyYaw, split.bodyPitch),
        Math.min(1, dt * 3.2),
      );
      eye.mesh.rotation.y = eye.bodySmooth.x;
      eye.mesh.rotation.x = -eye.bodySmooth.y;
      eye.socket.position.set(
        eye.home.x + eye.bodySmooth.x * MOTION.bodyShift,
        eye.home.y + eye.bodySmooth.y * MOTION.bodyShift,
        eye.home.z,
      );

      const targetGaze = new THREE.Vector2(
        split.pupil.x + wander.x * 0.4 + sac.x,
        split.pupil.y + wander.y * 0.4 + sac.y,
      );
      eye.gazeSmooth.lerp(targetGaze, Math.min(1, dt * 6));
      (u.uGaze.value as THREE.Vector2).copy(eye.gazeSmooth);

      // the cord pumps harder when the mind is working
      eye.cord?.update(time);
      eye.cord?.setSwell(0.75 + energy * 0.5 + this.pulseLevel * 0.6);
    });

    if (this.membraneMat) {
      this.membraneMat.uniforms.uTime.value = time;
      this.membraneMat.uniforms.uLookMix.value = this.lookMix;
      this.membraneMat.uniforms.uEnergy.value = 0.4 + 0.25 * energy + this.pulseLevel * 0.3;
    }
  }

  setMotion(mode: MotionMode): void {
    this.motionMode = mode;
  }

  /** breath depth, 1 = the documented low-dose sigh; 0 stills it */
  setBreath(v: number): void {
    for (const eye of this.eyes) eye.mat.uniforms.uBreath.value = Math.max(0, v);
  }

  get motion(): MotionMode {
    return this.motionMode;
  }

  dispose(): void {
    this.feedback.dispose();
    for (const eye of this.eyes) {
      eye.mat.dispose();
      eye.cord?.dispose();
    }
    this.membraneMat?.dispose();
  }
}
